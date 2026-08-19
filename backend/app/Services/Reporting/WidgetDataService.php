<?php

namespace App\Services\Reporting;

use App\Models\PipelineStage;
use App\Models\User;
use App\Services\ConditionFilter;
use Illuminate\Support\Facades\DB;

/**
 * Builds the aggregation query behind a dashboard widget. Every column that
 * reaches SQL is looked up in EntityDescriptor first — a field name the
 * descriptor doesn't list is dropped, never interpolated.
 */
class WidgetDataService
{
    private const AGGREGATIONS = ['count', 'sum', 'avg', 'max', 'min'];

    /**
     * @param  array<string, mixed>  $config
     * @return array{rows: array<int, array{key: string|null, label: string, color: string|null, total: float}>, total: float}
     */
    public function aggregate(array $config, User $user): array
    {
        $entity     = (string) ($config['entity'] ?? '');
        $descriptor = EntityDescriptor::for($entity);

        if ($descriptor === null) {
            throw new \InvalidArgumentException("Unknown entity '{$entity}'");
        }

        $table = $descriptor['table'];
        $query = $descriptor['model']::query();

        $this->applyOwnerScope($query, $descriptor, $entity, $user);
        $resolvedRange = $this->applyTimePeriod($query, $descriptor, $table, $config['timePeriod'] ?? null);
        $resolvedRangeOut = $resolvedRange === null ? null : [
            'from' => $resolvedRange[0]->format('Y-m-d'),
            'to'   => $resolvedRange[1]->format('Y-m-d'),
        ];

        if (! empty($config['conditions']) && is_array($config['conditions'])) {
            ConditionFilter::apply(
                $query,
                $config['conditions'],
                array_keys($descriptor['filterFields']),
                $descriptor['jsonColumn']
            );
        }

        if (! empty($config['orConditions']) && is_array($config['orConditions'])) {
            $orConditions = $config['orConditions'];
            $filterFields = array_keys($descriptor['filterFields']);
            $jsonColumn   = $descriptor['jsonColumn'];
            $query->where(function ($q) use ($orConditions, $filterFields, $jsonColumn) {
                ConditionFilter::apply($q, $orConditions, $filterFields, $jsonColumn, false, 'or');
            });
        }

        $aggregation = in_array($config['aggregation'] ?? 'count', self::AGGREGATIONS, true)
            ? ($config['aggregation'] ?? 'count')
            : 'count';

        // A value field is only honoured when the descriptor lists it; anything
        // else degrades to counting rows.
        $valueField = $config['valueField'] ?? null;
        if ($aggregation === 'count' || ! isset($descriptor['valueFields'][$valueField])) {
            $aggregateSql = 'count(*)';
        } else {
            $aggregateSql = "{$aggregation}(`{$table}`.`{$valueField}`)";
        }

        $displayField = $config['displayField'] ?? null;
        $groupMeta    = $displayField !== null ? ($descriptor['groupFields'][$displayField] ?? null) : null;

        if ($groupMeta === null) {
            $total = (float) $query->clone()->selectRaw("{$aggregateSql} as total")->value('total');

            return [
                'rows'  => [['key' => null, 'label' => 'סה״כ', 'color' => null, 'total' => $total]],
                'total' => $total,
                'resolvedRange' => $resolvedRangeOut,
            ];
        }

        $totalQuery = $query->clone();
        $total      = (float) $totalQuery->selectRaw("{$aggregateSql} as total")->value('total');

        $groupByField = $config['groupBy']['field'] ?? null;
        $groupByMeta  = $groupByField !== null ? ($descriptor['groupFields'][$groupByField] ?? null) : null;

        if ($groupByMeta === null) {
            $rows = $query
                ->select("{$table}.{$displayField} as group_key", DB::raw("{$aggregateSql} as total"))
                ->groupBy("{$table}.{$displayField}")
                ->orderByDesc('total')
                ->limit(50)
                ->get();

            $labels = $this->labelResolver($groupMeta);

            $mapped = $rows->map(function ($row) use ($labels) {
                $key = $row->group_key;
                [$label, $color] = $labels($key);

                return [
                    'key'   => $key === null ? null : (string) $key,
                    'label' => $label,
                    'color' => $color,
                    'total' => (float) $row->total,
                ];
            })->values()->all();

            return ['rows' => $mapped, 'total' => $total, 'resolvedRange' => $resolvedRangeOut];
        }

        // Second dimension present — build a two-column GROUP BY and pivot into
        // {rows: [{key,label,color,series:{seriesKey: total}}], seriesKeys: [...]}.
        $secondExpr = "{$table}.{$groupByField}";
        if (($groupByMeta['type'] ?? null) === 'date') {
            $granularity = $config['groupBy']['granularity'] ?? 'day';
            $pattern = match ($granularity) {
                'week'  => '%x-W%v',
                'month' => '%Y-%m',
                'year'  => '%Y',
                default => '%Y-%m-%d',
            };
            $secondExpr = "DATE_FORMAT({$table}.{$groupByField}, '{$pattern}')";
        }

        // Cap the number of GROUPS (not group×series rows) at 50 — same limit as the
        // single-dimension branch — so every group that makes the cut gets its full
        // series coverage instead of an arbitrary cross-product row limit truncating
        // some groups' series mid-way.
        $topGroupKeys = $query->clone()
            ->select("{$table}.{$displayField} as group_key", DB::raw("{$aggregateSql} as total"))
            ->groupBy("{$table}.{$displayField}")
            ->orderByDesc('total')
            ->limit(50)
            ->pluck('group_key')
            ->all();

        if (empty($topGroupKeys)) {
            return ['rows' => [], 'seriesKeys' => [], 'total' => $total, 'resolvedRange' => $resolvedRangeOut];
        }

        $rows = $query
            ->whereIn("{$table}.{$displayField}", $topGroupKeys)
            ->select(
                "{$table}.{$displayField} as group_key",
                DB::raw("{$secondExpr} as series_key"),
                DB::raw("{$aggregateSql} as total")
            )
            ->groupBy("{$table}.{$displayField}", DB::raw($secondExpr))
            ->orderByDesc('total')
            ->get();

        $groupLabels  = $this->labelResolver($groupMeta);
        $seriesLabels = $this->labelResolver($groupByMeta);

        $seenSeries = [];
        $pivoted    = [];

        foreach ($rows as $row) {
            $groupKey  = $row->group_key === null ? null : (string) $row->group_key;
            $seriesKey = $row->series_key === null ? null : (string) $row->series_key;

            if (! isset($pivoted[$groupKey ?? '__null__'])) {
                [$label, $color] = $groupLabels($row->group_key);
                $pivoted[$groupKey ?? '__null__'] = [
                    'key' => $groupKey, 'label' => $label, 'color' => $color, 'series' => [],
                ];
            }
            $pivoted[$groupKey ?? '__null__']['series'][$seriesKey ?? '__null__'] = (float) $row->total;

            if (! isset($seenSeries[$seriesKey ?? '__null__'])) {
                [$seriesLabel] = $seriesLabels($row->series_key);
                $seenSeries[$seriesKey ?? '__null__'] = ['key' => $seriesKey, 'label' => $seriesLabel];
            }
        }

        return [
            'rows'          => array_values($pivoted),
            'seriesKeys'    => array_values($seenSeries),
            'total'         => $total,
            'resolvedRange' => $resolvedRangeOut,
        ];
    }

    /**
     * @param  array<string, mixed>  $descriptor
     */
    private function applyOwnerScope($query, array $descriptor, string $entity, User $user): void
    {
        if ($user->role !== 'agent') {
            return;
        }

        if ($entity === 'activity') {
            // Activities have no owner column — scope through the leads they hang off
            $query->whereIn('entity_id', function ($sub) use ($user) {
                $sub->select('id')->from('leads')
                    ->where('assigned_to', $user->id)
                    ->whereNull('deleted_at');
            })->where('entity_type', 'lead');

            return;
        }

        if ($descriptor['ownerColumn'] !== null) {
            $query->where($descriptor['table'] . '.' . $descriptor['ownerColumn'], $user->id);
        }
    }

    /**
     * @param  array<string, mixed>  $descriptor
     * @param  array<string, mixed>|null  $timePeriod
     * @return array{0: \Carbon\Carbon, 1: \Carbon\Carbon}|null
     */
    private function applyTimePeriod($query, array $descriptor, string $table, ?array $timePeriod): ?array
    {
        if (! $timePeriod) {
            return null;
        }

        $field    = $timePeriod['field'] ?? null;
        $operator = $timePeriod['operator'] ?? null;

        if (! $field || ! $operator || ! isset($descriptor['dateFields'][$field])) {
            return null;
        }

        $column = "{$table}.{$field}";

        if ($operator === 'not_equals') {
            $range = RelativeDateRange::resolve('equals', $timePeriod['value'] ?? null);
            if ($range !== null) {
                $query->whereNotBetween($column, $range);
                // not_equals excludes a range rather than selecting one — nothing
                // sensible to echo as "the" resolved range, so report none.
                return null;
            }

            return null;
        }

        $range = RelativeDateRange::resolve($operator, $timePeriod['value'] ?? null);
        if ($range !== null) {
            $query->whereBetween($column, $range);
        }

        return $range;
    }

    /**
     * Returns a closure mapping a raw group key to [label, color].
     *
     * @param  array<string, mixed>  $groupMeta
     * @return callable(mixed): array{0: string, 1: string|null}
     */
    private function labelResolver(array $groupMeta): callable
    {
        if (($groupMeta['type'] ?? null) === 'lookup' && ($groupMeta['lookup'] ?? null) === 'users') {
            $users = User::query()->pluck('name', 'id');

            return fn ($key) => [$key === null ? 'לא משויך' : ($users[$key] ?? 'לא משויך'), null];
        }

        if (($groupMeta['type'] ?? null) === 'lookup' && ($groupMeta['lookup'] ?? null) === 'stages') {
            $stages = PipelineStage::query()->get(['id', 'name', 'color'])->keyBy('id');

            return function ($key) use ($stages) {
                $stage = $key === null ? null : $stages->get($key);

                return [$stage?->name ?? 'ללא שלב', $stage?->color];
            };
        }

        if (($groupMeta['type'] ?? null) === 'enum') {
            $options = $groupMeta['options'] ?? [];

            return fn ($key) => [$options[$key] ?? ($key === null || $key === '' ? 'ריק' : (string) $key), null];
        }

        return fn ($key) => [$key === null || $key === '' ? 'ריק' : (string) $key, null];
    }
}
