<?php

namespace App\Services\Reporting;

use App\Models\CustomFieldDefinition;
use App\Models\PipelineStage;
use App\Models\Record;
use App\Models\RecordPaymentLine;
use App\Models\RecordType;
use App\Models\User;
use App\Services\ConditionFilter;
use Illuminate\Support\Facades\DB;

/**
 * Builds the aggregation query behind a dashboard widget. Every column that
 * reaches SQL is looked up in a descriptor first — a field name the
 * descriptor doesn't list is dropped, never interpolated. Descriptors come
 * from two places: EntityDescriptor's static registry for the 5 built-in
 * entities, or buildRecordDescriptor() for a tenant's custom record types
 * (entity key "record:<slug>"), built fresh per request from that tenant's
 * CustomFieldDefinition rows since every tenant's custom records differ.
 */
class WidgetDataService
{
    private const AGGREGATIONS = ['count', 'sum', 'avg', 'max', 'min'];

    /** field_type (custom_field_definitions) => widget builder field type */
    private const RECORD_FIELD_TYPE_MAP = [
        'text' => 'text', 'textarea' => 'text', 'url' => 'text', 'phone' => 'text', 'email' => 'text',
        'number' => 'number', 'select' => 'enum', 'checkbox' => 'enum',
        'date' => 'date', 'datetime' => 'date',
    ];

    /**
     * @param  array<string, mixed>  $config
     * @return array{rows: array<int, array{key: string|null, label: string, color: string|null, total: float}>, total: float}
     */
    public function aggregate(array $config, User $user): array
    {
        $entity     = (string) ($config['entity'] ?? '');
        $descriptor = $this->resolveDescriptor($entity);

        if ($descriptor === null) {
            throw new \InvalidArgumentException("Unknown entity '{$entity}'");
        }

        $table = $descriptor['table'];
        $query = $descriptor['model']::query();

        if (isset($descriptor['recordTypeId'])) {
            $query->where('record_type_id', $descriptor['recordTypeId']);
        }
        if (isset($descriptor['recordTypeIdsIn'])) {
            $query->join('records', 'records.id', '=', 'record_payment_lines.record_id')
                ->whereIn('records.record_type_id', $descriptor['recordTypeIdsIn'])
                ->select('record_payment_lines.*');
        }

        $this->applyOwnerScope($query, $descriptor, $entity, $user);
        $resolvedRange = $this->applyTimePeriod($query, $descriptor, $table, $config['timePeriod'] ?? null);
        $resolvedRangeOut = $resolvedRange === null ? null : [
            'from' => $resolvedRange[0]->format('Y-m-d'),
            'to'   => $resolvedRange[1]->format('Y-m-d'),
        ];

        // Custom record types have no fixed columns at all — every field (not just
        // cf_*-prefixed ones) lives inside the jsonColumn, unlike lead/client/contact.
        $allFieldsAreJson = !empty($descriptor['jsonOnly']);

        if (! empty($config['conditions']) && is_array($config['conditions'])) {
            ConditionFilter::apply(
                $query,
                $config['conditions'],
                array_keys($descriptor['filterFields']),
                $descriptor['jsonColumn'],
                $allFieldsAreJson
            );
        }

        if (! empty($config['orConditions']) && is_array($config['orConditions'])) {
            $orConditions = $config['orConditions'];
            $filterFields = array_keys($descriptor['filterFields']);
            $jsonColumn   = $descriptor['jsonColumn'];
            $query->where(function ($q) use ($orConditions, $filterFields, $jsonColumn, $allFieldsAreJson) {
                ConditionFilter::apply($q, $orConditions, $filterFields, $jsonColumn, $allFieldsAreJson, 'or');
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
            $valueExpr = $this->columnExpr($table, $valueField, $descriptor);
            // JSON_EXTRACT yields a JSON-typed string; cast so sum/avg/max/min see a number.
            if (!empty($descriptor['jsonOnly'])) {
                $valueExpr = "CAST({$valueExpr} AS DECIMAL(18,4))";
            }
            $aggregateSql = "{$aggregation}({$valueExpr})";
        }

        $displayField = $config['displayField'] ?? null;
        $groupMeta    = $displayField !== null ? ($descriptor['groupFields'][$displayField] ?? null) : null;

        if ($groupMeta === null) {
            $total = round((float) $query->clone()->selectRaw("{$aggregateSql} as total")->value('total'), 2);

            return [
                'rows'  => [['key' => null, 'label' => 'סה״כ', 'color' => null, 'total' => $total]],
                'total' => $total,
                'resolvedRange' => $resolvedRangeOut,
            ];
        }

        $totalQuery = $query->clone();
        $total      = round((float) $totalQuery->selectRaw("{$aggregateSql} as total")->value('total'), 2);

        $groupByField = $config['groupBy']['field'] ?? null;
        $groupByMeta  = $groupByField !== null ? ($descriptor['groupFields'][$groupByField] ?? null) : null;

        $displayExpr = $this->columnExpr($table, $displayField, $descriptor);
        $displayIsDate = ($groupMeta['type'] ?? null) === 'date';
        if ($displayIsDate) {
            // Primary grouping by a date field (e.g. "revenue by month") — bucket by
            // the same granularity the second-dimension date grouping already uses
            // below, so a raw-timestamp column doesn't produce one group per row.
            $displayGranularity = $config['displayGranularity'] ?? 'month';
            $pattern = match ($displayGranularity) {
                'week'  => '%x-W%v',
                'month' => '%Y-%m',
                'year'  => '%Y',
                default => '%Y-%m-%d',
            };
            $displayExpr = "DATE_FORMAT({$displayExpr}, '{$pattern}')";
        }

        if ($groupByMeta === null) {
            $rows = $query
                ->select(DB::raw("{$displayExpr} as group_key"), DB::raw("{$aggregateSql} as total"))
                ->groupBy(DB::raw($displayExpr))
                ->when($displayIsDate, fn ($q) => $q->orderBy('group_key'), fn ($q) => $q->orderByDesc('total'))
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
                    'total' => round((float) $row->total, 2),
                ];
            })->values()->all();

            return ['rows' => $mapped, 'total' => $total, 'resolvedRange' => $resolvedRangeOut];
        }

        // Second dimension present — build a two-column GROUP BY and pivot into
        // {rows: [{key,label,color,series:{seriesKey: total}}], seriesKeys: [...]}.
        $secondExpr = $this->columnExpr($table, $groupByField, $descriptor);
        if (($groupByMeta['type'] ?? null) === 'date') {
            $granularity = $config['groupBy']['granularity'] ?? 'day';
            $pattern = match ($granularity) {
                'week'  => '%x-W%v',
                'month' => '%Y-%m',
                'year'  => '%Y',
                default => '%Y-%m-%d',
            };
            $secondExpr = "DATE_FORMAT({$secondExpr}, '{$pattern}')";
        }

        // Cap the number of GROUPS (not group×series rows) at 50 — same limit as the
        // single-dimension branch — so every group that makes the cut gets its full
        // series coverage instead of an arbitrary cross-product row limit truncating
        // some groups' series mid-way.
        $topGroupKeys = $query->clone()
            ->select(DB::raw("{$displayExpr} as group_key"), DB::raw("{$aggregateSql} as total"))
            ->groupBy(DB::raw($displayExpr))
            ->orderByDesc('total')
            ->limit(50)
            ->pluck('group_key')
            ->all();

        if (empty($topGroupKeys)) {
            return ['rows' => [], 'seriesKeys' => [], 'total' => $total, 'resolvedRange' => $resolvedRangeOut];
        }

        $rows = $query
            ->whereIn(DB::raw($displayExpr), $topGroupKeys)
            ->select(
                DB::raw("{$displayExpr} as group_key"),
                DB::raw("{$secondExpr} as series_key"),
                DB::raw("{$aggregateSql} as total")
            )
            ->groupBy(DB::raw($displayExpr), DB::raw($secondExpr))
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
            $pivoted[$groupKey ?? '__null__']['series'][$seriesKey ?? '__null__'] = round((float) $row->total, 2);

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

    /** @return array<string, mixed>|null */
    private function resolveDescriptor(string $entity): ?array
    {
        if (str_starts_with($entity, 'payments:')) {
            $slug = substr($entity, 9);

            return $this->buildPaymentDescriptor($slug === 'all' ? null : $slug);
        }

        if (str_starts_with($entity, 'record:')) {
            return $this->buildRecordDescriptor(substr($entity, 7));
        }

        return EntityDescriptor::for($entity);
    }

    /**
     * Builds an EntityDescriptor-shaped array for one tenant's custom record
     * type, from its CustomFieldDefinition rows. Every field lives in the
     * `records.data` JSON column — jsonOnly marks that for columnExpr().
     * Public: WidgetController::fields() also needs this shape to advertise
     * record types as selectable entities in the widget builder UI.
     *
     * @return array<string, mixed>|null null when the slug doesn't resolve to
     *                                    a record type owned by the current tenant
     */
    public function buildRecordDescriptor(string $slug): ?array
    {
        $tenantId = app('current_tenant_id');

        $recordType = RecordType::where('tenant_id', $tenantId)->where('slug', $slug)->first();
        if ($recordType === null) {
            return null;
        }

        $defs = CustomFieldDefinition::where('tenant_id', $tenantId)->where('entity', $slug)->get();

        $groupFields = $filterFields = $valueFields = [];
        $dateFields  = ['created_at' => 'נוצר בתאריך'];
        // created_at is a real column on every jsonOnly record too (see columnExpr's
        // exemption below) — expose it as a groupable date field like every built-in
        // entity already does, so month/year charts work for custom record types too.
        $groupFields['created_at'] = ['label' => 'נוצר בתאריך', 'type' => 'date'];

        foreach ($defs as $def) {
            $type = self::RECORD_FIELD_TYPE_MAP[$def->field_type] ?? 'text';
            $meta = ['label' => $def->label, 'type' => $type];

            if ($type === 'enum') {
                $meta['options'] = $def->field_type === 'checkbox'
                    ? ['1' => 'כן', '0' => 'לא']
                    : array_combine($def->options ?? [], $def->options ?? []);
            }

            $groupFields[$def->name]  = $meta;
            $filterFields[$def->name] = $meta;

            if ($type === 'number') {
                $valueFields[$def->name] = ['label' => $def->label, 'type' => 'number'];
            }
            if ($type === 'date') {
                $dateFields[$def->name] = $def->label;
            }
        }

        return [
            'label'        => $recordType->label,
            'model'        => Record::class,
            'table'        => 'records',
            'ownerColumn'  => null,
            'jsonColumn'   => 'data',
            'jsonOnly'     => true,
            'recordTypeId' => $recordType->id,
            'valueFields'  => $valueFields,
            'groupFields'  => $groupFields,
            'filterFields' => $filterFields,
            'dateFields'   => $dateFields,
        ];
    }

    /**
     * Builds an EntityDescriptor-shaped array over record_payment_lines,
     * joined to record_types for the tenant filter. $slug === null aggregates
     * across every record type flagged has_payment_lines for this tenant
     * (entity key "payments:all"); a slug scopes to one type ("payments:<slug>").
     * Unlike buildRecordDescriptor(), payment_type/amount are real columns —
     * jsonOnly is false, so columnExpr() emits plain column references.
     *
     * @return array<string, mixed>|null null when a given slug doesn't resolve
     *                                    to a has_payment_lines type for this tenant
     */
    public function buildPaymentDescriptor(?string $slug): ?array
    {
        $tenantId = app('current_tenant_id');

        $typesQuery = RecordType::where('tenant_id', $tenantId)->where('has_payment_lines', true);
        if ($slug !== null) {
            $typesQuery->where('slug', $slug);
        }
        $recordTypeIds = $typesQuery->pluck('id');

        if ($recordTypeIds->isEmpty()) {
            return null;
        }

        $label = $slug === null
            ? 'תשלומים — הכל'
            : 'תשלומים — ' . (RecordType::where('tenant_id', $tenantId)->where('slug', $slug)->value('label') ?? $slug);

        return [
            'label'        => $label,
            'model'        => RecordPaymentLine::class,
            'table'        => 'record_payment_lines',
            'ownerColumn'  => null,
            'jsonColumn'   => null,
            'jsonOnly'     => false,
            'recordTypeIdsIn' => $recordTypeIds->all(),
            'valueFields'  => ['amount' => ['label' => 'סכום', 'type' => 'number']],
            'groupFields'  => [
                'payment_type' => [
                    'label'   => 'סוג תשלום',
                    'type'    => 'enum',
                    'options' => RecordPaymentLine::PAYMENT_TYPES,
                ],
                'paid_at' => ['label' => 'תאריך תשלום', 'type' => 'date'],
                'created_at' => ['label' => 'נוצר בתאריך', 'type' => 'date'],
            ],
            'filterFields' => [
                'payment_type' => [
                    'label'   => 'סוג תשלום',
                    'type'    => 'enum',
                    'options' => RecordPaymentLine::PAYMENT_TYPES,
                ],
            ],
            'dateFields'   => ['paid_at' => 'תאריך תשלום', 'created_at' => 'נוצר בתאריך'],
        ];
    }

    /**
     * Resolves a field name to the SQL expression that reads it — a plain
     * column for normal entities, or a JSON_EXTRACT against the descriptor's
     * jsonColumn for a jsonOnly (custom record type) descriptor. created_at/
     * updated_at stay real columns even on jsonOnly entities since those two
     * are physical columns on every table, never stored inside the JSON blob.
     *
     * @param  array<string, mixed>  $descriptor
     */
    private function columnExpr(string $table, string $field, array $descriptor): string
    {
        if (!empty($descriptor['jsonOnly']) && !in_array($field, ['created_at', 'updated_at'], true)) {
            $jsonCol = $descriptor['jsonColumn'];

            return "JSON_UNQUOTE(JSON_EXTRACT(`{$table}`.`{$jsonCol}`, '$.\"{$field}\"'))";
        }

        return "{$table}.{$field}";
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

        $column = DB::raw($this->columnExpr($table, $field, $descriptor));

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

            return fn ($key) => [$options[$key] ?? ($key === null || $key === '' ? 'ריק' : self::formatKey($key)), null];
        }

        return fn ($key) => [$key === null || $key === '' ? 'ריק' : self::formatKey($key), null];
    }

    /**
     * Group labels come straight from SQL (JSON_EXTRACT / DECIMAL columns can
     * carry 4+ decimal places of raw precision) — numeric-looking values are
     * rounded to 2 decimals for display, matching every other number shown in
     * the widget builder (totals, KPI values).
     */
    private static function formatKey(mixed $key): string
    {
        if (is_numeric($key)) {
            return (string) round((float) $key, 2);
        }

        return (string) $key;
    }
}
