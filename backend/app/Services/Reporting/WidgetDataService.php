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
        $this->applyTimePeriod($query, $descriptor, $table, $config['timePeriod'] ?? null);

        if (! empty($config['conditions']) && is_array($config['conditions'])) {
            ConditionFilter::apply(
                $query,
                $config['conditions'],
                array_keys($descriptor['filterFields']),
                'custom_fields'
            );
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
            ];
        }

        $rows = $query
            ->select("{$table}.{$displayField} as group_key", DB::raw("{$aggregateSql} as total"))
            ->groupBy("{$table}.{$displayField}")
            ->orderByDesc('total')
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

        return ['rows' => $mapped, 'total' => (float) array_sum(array_column($mapped, 'total'))];
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
     */
    private function applyTimePeriod($query, array $descriptor, string $table, ?array $timePeriod): void
    {
        if (! $timePeriod) {
            return;
        }

        $field    = $timePeriod['field'] ?? null;
        $operator = $timePeriod['operator'] ?? null;

        if (! $field || ! $operator || ! isset($descriptor['dateFields'][$field])) {
            return;
        }

        $column = "{$table}.{$field}";

        if ($operator === 'not_equals') {
            $range = RelativeDateRange::resolve('equals', $timePeriod['value'] ?? null);
            if ($range !== null) {
                $query->whereNotBetween($column, $range);
            }

            return;
        }

        $range = RelativeDateRange::resolve($operator, $timePeriod['value'] ?? null);
        if ($range !== null) {
            $query->whereBetween($column, $range);
        }
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
