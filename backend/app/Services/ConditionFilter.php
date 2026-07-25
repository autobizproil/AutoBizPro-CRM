<?php

namespace App\Services;

class ConditionFilter
{
    private const OPERATORS = ['equals', 'not_equals', 'contains', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty'];

    /**
     * Apply Fireberry-style multi-condition filters to a query.
     *
     * @param  array<int, array{field?: string, operator?: string, value?: mixed}>  $conditions
     * @param  array<int, string>  $systemFields  whitelisted direct-column field names (ignored when $allFieldsAreJson)
     * @param  string|null  $jsonColumn  column name holding JSON fields, or null if this entity has none
     * @param  bool  $allFieldsAreJson  true when every field (no 'cf_' prefix) resolves through $jsonColumn,
     *                                  e.g. custom record types where everything lives in `data`
     */
    public static function apply($query, array $conditions, array $systemFields, ?string $jsonColumn = null, bool $allFieldsAreJson = false): void
    {
        foreach ($conditions as $cond) {
            $field    = $cond['field'] ?? null;
            $operator = $cond['operator'] ?? null;
            $value    = $cond['value'] ?? null;

            if (! $field || ! in_array($operator, self::OPERATORS, true)) {
                continue;
            }

            if ($allFieldsAreJson) {
                if (! $jsonColumn || ! preg_match('/^[a-z0-9_]+$/', (string) $field)) {
                    continue;
                }
                $column = \Illuminate\Support\Facades\DB::raw("JSON_UNQUOTE(JSON_EXTRACT(`{$jsonColumn}`, '$.\"" . $field . "\"'))");
            } else {
                $isCustom = $jsonColumn && str_starts_with((string) $field, 'cf_') && preg_match('/^cf_[a-z0-9_]+$/', $field);
                if (! $isCustom && ! in_array($field, $systemFields, true)) {
                    continue;
                }
                $column = $isCustom
                    ? \Illuminate\Support\Facades\DB::raw("JSON_UNQUOTE(JSON_EXTRACT(`{$jsonColumn}`, '$.\"" . substr($field, 3) . "\"'))")
                    : $field;
            }

            match ($operator) {
                'equals'     => $query->where($column, '=', $value),
                'not_equals' => $query->where($column, '!=', $value),
                'contains'   => $query->where($column, 'like', "%{$value}%"),
                'gt'         => $query->where($column, '>', $value),
                'gte'        => $query->where($column, '>=', $value),
                'lt'         => $query->where($column, '<', $value),
                'lte'        => $query->where($column, '<=', $value),
                'empty'      => $query->where(fn ($q) => $q->whereNull($column)->orWhere($column, '=', '')),
                'not_empty'  => $query->where(fn ($q) => $q->whereNotNull($column)->where($column, '!=', '')),
                default      => null,
            };
        }
    }
}
