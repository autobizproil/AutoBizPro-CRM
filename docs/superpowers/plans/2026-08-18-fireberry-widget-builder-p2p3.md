# Fireberry Widget Builder — Phase 2+3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drill-down, a second grouping dimension with stacked/grouped charts, KPI targets, AND/OR filter groups, a metrics-table widget type, and server-side board persistence to the P1 widget builder.

**Architecture:** Everything layers onto the P1 foundation (`EntityDescriptor`, `RelativeDateRange`, `WidgetDataService`, `WidgetController`, `AddWidgetModal.jsx`, `WidgetCard.jsx`, `widgetConfig.js` — all already deployed, read them before touching anything). Backend additions extend `WidgetDataService::aggregate()`'s config surface without breaking its existing callers. Board persistence is a fully independent slice (new tables, new controller) that only replaces *where* boards are stored, not how widgets render.

**Tech Stack:** Laravel 11 (`backend/`), PHPUnit via `php artisan test`; React 18 + Vite (`frontend/`), Vitest; Tailwind; TanStack Query; MySQL.

## Global Constraints

- Every task that adds backend config keys must keep old callers working: a widget with no `orConditions`, no `groupBy`, no `target` must behave byte-identical to before this plan.
- No client-supplied string reaches SQL except through `EntityDescriptor` whitelist lookups (unchanged rule from P1) — this applies to every new field this plan touches (`groupBy.field`, `groupBy.granularity`).
- Schema changes need a migration in `backend/database/migrations/` **and** a mirrored `.sql` file in `SCHEMA_DB/` with the same base filename and `IF NOT EXISTS` on the `CREATE TABLE` — follow the exact pattern in `SCHEMA_DB/2026_07_26_000002_create_saved_views_table.sql` (mirrors `backend/database/migrations/2026_07_26_000002_create_saved_views_table.php`).
- All user-facing strings Hebrew, matching existing UI copy.
- Run `cd backend && php artisan test` and `cd frontend && npx vitest run` before every commit; the pre-commit hook re-runs both — never bypass with `--no-verify`.
- Deploy is NOT part of this plan's tasks — stop after the final task's commit and ask before deploying, matching the P1 plan's pattern (backend `route:cache`/`config:cache` + frontend `npm run build` + copy `frontend/dist/assets` and `frontend/dist/index.html` into `backend/public/` — nginx serves from there, not from `frontend/dist`).

---

### Task 1: `WidgetDataService` echoes the resolved time-period range

**Files:**
- Modify: `backend/app/Services/Reporting/WidgetDataService.php`
- Modify: `backend/tests/Feature/WidgetDataServiceTest.php`

**Interfaces:**
- Consumes: nothing new.
- Produces: `aggregate()`'s return array gains a `'resolvedRange' => ['from' => string, 'to' => string]|null` key (ISO date strings `Y-m-d`, or `null` when no time period was resolved). Task 6 (drill-down) reads this to translate a widget's relative period into `date_from`/`date_to` for the entity's list endpoint.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/Feature/WidgetDataServiceTest.php` (inside the `WidgetDataServiceTest` class, alongside the existing `test_time_period_filters_rows` test):

```php
    public function test_resolved_range_is_echoed_when_time_period_set(): void
    {
        \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse('2026-08-19 12:00:00'));

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);

        $result = $this->service()->aggregate([
            'entity'     => 'lead',
            'timePeriod' => ['field' => 'created_at', 'operator' => 'current_month'],
        ], $this->admin);

        $this->assertSame('2026-08-01', $result['resolvedRange']['from']);
        $this->assertSame('2026-08-31', $result['resolvedRange']['to']);

        \Carbon\Carbon::setTestNow();
    }

    public function test_resolved_range_is_null_without_time_period(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);

        $result = $this->service()->aggregate(['entity' => 'lead'], $this->admin);

        $this->assertNull($result['resolvedRange']);
    }

    public function test_resolved_range_is_null_for_unresolvable_operator(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);

        $result = $this->service()->aggregate([
            'entity'     => 'lead',
            'timePeriod' => ['field' => 'created_at', 'operator' => 'not_a_real_operator'],
        ], $this->admin);

        $this->assertNull($result['resolvedRange']);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=WidgetDataServiceTest`
Expected: FAIL — `Undefined array key "resolvedRange"` on the three new tests; existing tests still pass.

- [ ] **Step 3: Write minimal implementation**

In `backend/app/Services/Reporting/WidgetDataService.php`, the `applyTimePeriod` method currently returns `void` and applies the filter directly to the query. Change it to also return the resolved range so `aggregate()` can echo it. Replace the whole method:

```php
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
```

Now update `aggregate()` to capture and echo the range. Find the line:

```php
        $this->applyTimePeriod($query, $descriptor, $table, $config['timePeriod'] ?? null);
```

Replace it with:

```php
        $resolvedRange = $this->applyTimePeriod($query, $descriptor, $table, $config['timePeriod'] ?? null);
        $resolvedRangeOut = $resolvedRange === null ? null : [
            'from' => $resolvedRange[0]->format('Y-m-d'),
            'to'   => $resolvedRange[1]->format('Y-m-d'),
        ];
```

Then there are two `return [...]` statements later in `aggregate()` — one in the ungrouped branch, one at the end of the grouped branch. Add `'resolvedRange' => $resolvedRangeOut` to both. The ungrouped branch's return:

```php
            return [
                'rows'  => [['key' => null, 'label' => 'סה״כ', 'color' => null, 'total' => $total]],
                'total' => $total,
            ];
```

becomes:

```php
            return [
                'rows'  => [['key' => null, 'label' => 'סה״כ', 'color' => null, 'total' => $total]],
                'total' => $total,
                'resolvedRange' => $resolvedRangeOut,
            ];
```

And the final return of the grouped branch:

```php
        return ['rows' => $mapped, 'total' => $total];
```

becomes:

```php
        return ['rows' => $mapped, 'total' => $total, 'resolvedRange' => $resolvedRangeOut];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=WidgetDataServiceTest`
Expected: PASS — all tests including the 3 new ones.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: PASS, no regressions (280 tests currently exist as of P1 completion; this adds 3 more).

- [ ] **Step 6: Commit**

```bash
git add backend/app/Services/Reporting/WidgetDataService.php backend/tests/Feature/WidgetDataServiceTest.php
git commit -m "feat: WidgetDataService echoes resolved time-period range"
```

---

### Task 2: AND/OR condition groups (`orConditions`)

**Files:**
- Modify: `backend/app/Services/ConditionFilter.php`
- Modify: `backend/app/Services/Reporting/WidgetDataService.php`
- Modify: `backend/tests/Feature/WidgetDataServiceTest.php`
- Test: `backend/tests/Feature/ConditionFilterTest.php` (this file already exists — read it first to match its conventions before adding to it)

**Interfaces:**
- Consumes: nothing new from other P2/3 tasks.
- Produces: `ConditionFilter::apply($query, $conditions, $systemFields, $jsonColumn = null, $allFieldsAreJson = false, $boolean = 'and')` — new optional 6th parameter, default `'and'` preserves every existing caller's behavior unchanged. `WidgetDataService::aggregate()`'s `$config` accepts an optional `'orConditions'` key (same shape as `conditions`) alongside the existing `conditions` key — this is the actual wire shape (two flat arrays, not a nested object) chosen for zero-migration backward compatibility with widgets already saved from P1 (a P1 widget has `conditions: [...]` and no `orConditions` key at all, which must keep behaving exactly as it does today).

- [ ] **Step 1: Read the existing test file for conventions**

Read `backend/tests/Feature/ConditionFilterTest.php` in full before writing anything — match its existing style (how it builds a query, which model it uses, assertion style).

- [ ] **Step 2: Write the failing tests**

Add to `backend/tests/Feature/ConditionFilterTest.php` (adapt the exact query-building boilerplate to match whatever pattern the file already uses — the assertions below are what matter):

```php
    public function test_or_boolean_wraps_conditions_in_a_single_orwhere_group(): void
    {
        // Two leads: one matches condition A only, one matches condition B only.
        // Applying [A, B] with boolean='or' inside one where-closure must match both.
        $tenant = \App\Models\Tenant::create(['name' => 'CF', 'subdomain' => 'cf-or', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        \App\Models\Lead::create(['tenant_id' => $tenant->id, 'name' => 'Matches A', 'source' => 'facebook']);
        \App\Models\Lead::create(['tenant_id' => $tenant->id, 'name' => 'Matches B', 'source' => 'website']);
        \App\Models\Lead::create(['tenant_id' => $tenant->id, 'name' => 'Matches Neither', 'source' => 'referral']);

        $query = \App\Models\Lead::query();
        \App\Services\ConditionFilter::apply(
            $query,
            [['field' => 'source', 'operator' => 'equals', 'value' => 'facebook'],
             ['field' => 'source', 'operator' => 'equals', 'value' => 'website']],
            ['source'],
            null,
            false,
            'or'
        );

        $names = $query->pluck('name')->sort()->values()->all();
        $this->assertSame(['Matches A', 'Matches B'], $names);
    }

    public function test_default_boolean_is_and_unchanged_from_before(): void
    {
        $tenant = \App\Models\Tenant::create(['name' => 'CF2', 'subdomain' => 'cf-and', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        \App\Models\Lead::create(['tenant_id' => $tenant->id, 'name' => 'Both', 'source' => 'facebook', 'status' => 'open']);
        \App\Models\Lead::create(['tenant_id' => $tenant->id, 'name' => 'Source only', 'source' => 'facebook', 'status' => 'won']);

        $query = \App\Models\Lead::query();
        \App\Services\ConditionFilter::apply(
            $query,
            [['field' => 'source', 'operator' => 'equals', 'value' => 'facebook'],
             ['field' => 'status', 'operator' => 'equals', 'value' => 'open']],
            ['source', 'status']
        );

        $names = $query->pluck('name')->all();
        $this->assertSame(['Both'], $names);
    }
```

Also add to `backend/tests/Feature/WidgetDataServiceTest.php`:

```php
    public function test_or_conditions_widen_results_beyond_and_conditions(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook', 'status' => 'open']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'source' => 'website', 'status' => 'won']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'C', 'source' => 'referral', 'status' => 'lost']);

        $result = $this->service()->aggregate([
            'entity'       => 'lead',
            'displayField' => 'source',
            'conditions'   => [['field' => 'status', 'operator' => 'equals', 'value' => 'open']],
            'orConditions' => [['field' => 'source', 'operator' => 'equals', 'value' => 'website']],
        ], $this->admin);

        // AND(status=open) must also satisfy OR(source=website) — only A qualifies
        // (status=open) since B fails the AND clause despite matching the OR clause.
        $sources = collect($result['rows'])->pluck('key')->all();
        $this->assertSame(['facebook'], $sources);
    }

    public function test_empty_or_conditions_is_a_no_op(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook']);

        $result = $this->service()->aggregate([
            'entity'       => 'lead',
            'orConditions' => [],
        ], $this->admin);

        $this->assertSame(1.0, $result['total']);
    }
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=ConditionFilterTest && php artisan test --filter=WidgetDataServiceTest`
Expected: FAIL — `ConditionFilter::apply()` doesn't accept a 6th argument yet (TypeError or ignored-argument-then-wrong-result depending on PHP's leniency; either way the OR-semantics assertions fail).

- [ ] **Step 4: Write minimal implementation**

Read `backend/app/Services/ConditionFilter.php` in full first (already shown above in this plan's exploration — but re-read the live file, don't trust this plan's copy is byte-exact). Replace its `apply()` method signature and the `match()` block with a boolean-aware version:

```php
    public static function apply($query, array $conditions, array $systemFields, ?string $jsonColumn = null, bool $allFieldsAreJson = false, string $boolean = 'and'): void
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

            $w = $boolean === 'or' ? 'orWhere' : 'where';

            match ($operator) {
                'equals'     => $query->{$w}($column, '=', $value),
                'not_equals' => $query->{$w}($column, '!=', $value),
                'contains'   => $query->{$w}($column, 'like', "%{$value}%"),
                'gt'         => $query->{$w}($column, '>', $value),
                'gte'        => $query->{$w}($column, '>=', $value),
                'lt'         => $query->{$w}($column, '<', $value),
                'lte'        => $query->{$w}($column, '<=', $value),
                'empty'      => $query->{$w}(fn ($q) => $q->whereNull($column)->orWhere($column, '=', '')),
                'not_empty'  => $query->{$w}(fn ($q) => $q->whereNotNull($column)->where($column, '!=', '')),
                default      => null,
            };
        }
    }
```

Update the docblock comment above `apply()` to mention the new parameter — add this line to the existing `@param` list:

```php
     * @param  string  $boolean  'and' (default) applies each condition with WHERE; 'or' applies each
     *                            with orWHERE — pass 'or' only inside a caller-supplied where-closure so
     *                            the OR group stays isolated from surrounding AND conditions.
```

Now in `backend/app/Services/Reporting/WidgetDataService.php`, find:

```php
        if (! empty($config['conditions']) && is_array($config['conditions'])) {
            ConditionFilter::apply(
                $query,
                $config['conditions'],
                array_keys($descriptor['filterFields']),
                $descriptor['jsonColumn']
            );
        }
```

Replace it with (adds the OR group in its own closure right after, without touching the AND behavior above):

```php
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=ConditionFilterTest && php artisan test --filter=WidgetDataServiceTest`
Expected: PASS — all tests.

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: PASS, no regressions. `ConditionFilter::apply()` is called by `LeadService`, `ContactController`, `ClientController`, `DashboardController`, `TaskController`, `RecordController` — none of them pass a 6th argument, so the new default `'and'` must leave every one of their tests green.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Services/ConditionFilter.php backend/app/Services/Reporting/WidgetDataService.php backend/tests/Feature/ConditionFilterTest.php backend/tests/Feature/WidgetDataServiceTest.php
git commit -m "feat: AND/OR condition groups via ConditionFilter boolean param"
```

---

### Task 3: Second grouping dimension (`groupBy`) with stacked/grouped charts

**Files:**
- Modify: `backend/app/Services/Reporting/WidgetDataService.php`
- Modify: `backend/tests/Feature/WidgetDataServiceTest.php`

**Interfaces:**
- Consumes: `EntityDescriptor::for()`'s `groupFields` (Task 1's plan, already deployed); the existing `labelResolver()` private method (reused, not duplicated).
- Produces: when `$config['groupBy'] = ['field' => string, 'granularity' => ?string]` is present and `groupBy.field` is a valid `groupFields` key, `aggregate()`'s grouped branch returns a different, additive shape:
  ```php
  [
    'rows'       => [['key' => string|null, 'label' => string, 'color' => string|null, 'series' => ['<seriesKey>' => float, ...]], ...],
    'seriesKeys' => [['key' => string, 'label' => string], ...],
    'total'      => float,
    'resolvedRange' => [...]|null,
  ]
  ```
  When `groupBy` is absent or invalid, the response shape is **exactly** what Tasks 1-2 already produce (`rows[].total` flat, no `series`/`seriesKeys` keys at all) — this is the backward-compatibility contract Task 8 (frontend) depends on to decide which rendering path to use.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/Feature/WidgetDataServiceTest.php`:

```php
    public function test_group_by_second_dimension_produces_series_shape(): void
    {
        $agentA = User::create(['tenant_id' => $this->tenant->id, 'name' => 'Agent A', 'email' => 'a@widget.test', 'password' => Hash::make('x'), 'role' => 'agent']);
        $agentB = User::create(['tenant_id' => $this->tenant->id, 'name' => 'Agent B', 'email' => 'b@widget.test', 'password' => Hash::make('x'), 'role' => 'agent']);

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A1', 'source' => 'facebook', 'assigned_to' => $agentA->id]);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A2', 'source' => 'facebook', 'assigned_to' => $agentB->id]);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A3', 'source' => 'website',  'assigned_to' => $agentA->id]);

        $result = $this->service()->aggregate([
            'entity'       => 'lead',
            'displayField' => 'source',
            'groupBy'      => ['field' => 'assigned_to'],
        ], $this->admin);

        $this->assertArrayHasKey('seriesKeys', $result);
        $seriesLabels = collect($result['seriesKeys'])->pluck('label')->sort()->values()->all();
        $this->assertSame(['Agent A', 'Agent B'], $seriesLabels);

        $facebookRow = collect($result['rows'])->firstWhere('key', 'facebook');
        $this->assertNotNull($facebookRow);
        $this->assertArrayHasKey('series', $facebookRow);
        $this->assertSame(1.0, $facebookRow['series'][(string) $agentA->id]);
        $this->assertSame(1.0, $facebookRow['series'][(string) $agentB->id]);

        $this->assertSame(3.0, $result['total']);
    }

    public function test_group_by_date_field_uses_granularity(): void
    {
        \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse('2026-08-19'));

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook'])
            ->forceFill(['created_at' => \Carbon\Carbon::parse('2026-08-01')])->saveQuietly();
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'source' => 'facebook'])
            ->forceFill(['created_at' => \Carbon\Carbon::parse('2026-08-15')])->saveQuietly();

        $result = $this->service()->aggregate([
            'entity'       => 'lead',
            'displayField' => 'source',
            'groupBy'      => ['field' => 'created_at', 'granularity' => 'month'],
        ], $this->admin);

        // Both leads fall in the same month bucket
        $facebookRow = collect($result['rows'])->firstWhere('key', 'facebook');
        $this->assertCount(1, $facebookRow['series']);
        $this->assertSame(2.0, array_sum($facebookRow['series']));

        \Carbon\Carbon::setTestNow();
    }

    public function test_group_by_unknown_field_is_ignored_falls_back_to_flat_shape(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook']);

        $result = $this->service()->aggregate([
            'entity'       => 'lead',
            'displayField' => 'source',
            'groupBy'      => ['field' => 'password'],
        ], $this->admin);

        $this->assertArrayNotHasKey('seriesKeys', $result);
        $this->assertSame(1.0, $result['rows'][0]['total']);
    }

    public function test_group_by_without_display_field_is_ignored(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);

        $result = $this->service()->aggregate([
            'entity'  => 'lead',
            'groupBy' => ['field' => 'source'],
        ], $this->admin);

        // No displayField at all → ungrouped branch, groupBy never even consulted.
        $this->assertArrayNotHasKey('seriesKeys', $result);
        $this->assertSame(1.0, $result['rows'][0]['total']);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=WidgetDataServiceTest`
Expected: FAIL — the 4 new tests fail (no `seriesKeys` key produced at all yet, or asserting on it errors).

- [ ] **Step 3: Write minimal implementation**

In `backend/app/Services/Reporting/WidgetDataService.php`, the grouped branch currently looks like this (after Tasks 1-2's edits):

```php
        $totalQuery = $query->clone();

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

        $total = (float) $totalQuery->selectRaw("{$aggregateSql} as total")->value('total');

        return ['rows' => $mapped, 'total' => $total, 'resolvedRange' => $resolvedRangeOut];
```

Replace the whole block (from `$totalQuery = $query->clone();` to the final `return` of the method) with:

```php
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

        $rows = $query
            ->select(
                "{$table}.{$displayField} as group_key",
                DB::raw("{$secondExpr} as series_key"),
                DB::raw("{$aggregateSql} as total")
            )
            ->groupBy("{$table}.{$displayField}", DB::raw($secondExpr))
            ->orderByDesc('total')
            ->limit(200)
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=WidgetDataServiceTest`
Expected: PASS — all tests, including the 4 new ones and everything from Tasks 1-2.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Services/Reporting/WidgetDataService.php backend/tests/Feature/WidgetDataServiceTest.php
git commit -m "feat: second grouping dimension with date granularity in WidgetDataService"
```

---

### Task 4: Board persistence — migration + models

**Files:**
- Create: `backend/database/migrations/2026_08_18_000001_create_dashboard_boards_table.php`
- Create: `backend/database/migrations/2026_08_18_000002_create_dashboard_widgets_table.php`
- Create: `SCHEMA_DB/2026_08_18_000001_create_dashboard_boards_table.sql`
- Create: `SCHEMA_DB/2026_08_18_000002_create_dashboard_widgets_table.sql`
- Create: `backend/app/Models/DashboardBoard.php`
- Create: `backend/app/Models/DashboardWidget.php`
- Test: `backend/tests/Feature/DashboardBoardModelTest.php`

**Interfaces:**
- Consumes: `HasTenantScope` trait (`backend/app/Traits/HasTenantScope.php`, unchanged).
- Produces: `DashboardBoard` (fillable: `tenant_id, user_id, name, position`), `DashboardWidget` (fillable: `tenant_id, board_id, config, position`; `config` cast to `array`) with `DashboardBoard::widgets(): HasMany` ordered by `position`, and `DashboardBoard::user(): BelongsTo`. Task 5 (controller) consumes both.

- [ ] **Step 1: Read a migration/SCHEMA_DB pair for the exact convention**

Read `backend/database/migrations/2026_07_26_000002_create_saved_views_table.php` and `SCHEMA_DB/2026_07_26_000002_create_saved_views_table.sql` in full — the tables you're about to create must follow this pair's exact conventions (both files, `IF NOT EXISTS` guard style, foreign key syntax, charset/collation).

- [ ] **Step 2: Write the failing test**

Create `backend/tests/Feature/DashboardBoardModelTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\DashboardBoard;
use App\Models\DashboardWidget;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DashboardBoardModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_board_and_widgets_can_be_created_and_related(): void
    {
        $tenant = Tenant::create(['name' => 'Board Tenant', 'subdomain' => 'boardt', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        $user = User::create([
            'tenant_id' => $tenant->id, 'name' => 'Admin',
            'email' => 'admin@boardt.test', 'password' => Hash::make('password'), 'role' => 'admin',
        ]);

        $board = DashboardBoard::create([
            'tenant_id' => $tenant->id, 'user_id' => $user->id, 'name' => 'ניתוח לידים', 'position' => 0,
        ]);

        $widgetConfig = ['type' => 'bar', 'entity' => 'lead', 'title' => 'לפי מקור', 'displayField' => 'source'];
        DashboardWidget::create([
            'tenant_id' => $tenant->id, 'board_id' => $board->id, 'config' => $widgetConfig, 'position' => 0,
        ]);

        $this->assertSame($user->id, $board->user->id);
        $this->assertCount(1, $board->widgets);
        $this->assertSame('bar', $board->widgets->first()->config['type']);
    }

    public function test_widgets_are_ordered_by_position(): void
    {
        $tenant = Tenant::create(['name' => 'Board Tenant 2', 'subdomain' => 'boardt2', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create([
            'tenant_id' => $tenant->id, 'name' => 'Admin',
            'email' => 'admin@boardt2.test', 'password' => Hash::make('password'), 'role' => 'admin',
        ]);
        $board = DashboardBoard::create(['tenant_id' => $tenant->id, 'user_id' => $user->id, 'name' => 'לוח', 'position' => 0]);

        DashboardWidget::create(['tenant_id' => $tenant->id, 'board_id' => $board->id, 'config' => ['title' => 'שני'], 'position' => 1]);
        DashboardWidget::create(['tenant_id' => $tenant->id, 'board_id' => $board->id, 'config' => ['title' => 'ראשון'], 'position' => 0]);

        $titles = $board->fresh()->widgets->pluck('config.title')->all();
        $this->assertSame(['ראשון', 'שני'], $titles);
    }

    public function test_deleting_board_cascades_to_widgets(): void
    {
        $tenant = Tenant::create(['name' => 'Board Tenant 3', 'subdomain' => 'boardt3', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create([
            'tenant_id' => $tenant->id, 'name' => 'Admin',
            'email' => 'admin@boardt3.test', 'password' => Hash::make('password'), 'role' => 'admin',
        ]);
        $board  = DashboardBoard::create(['tenant_id' => $tenant->id, 'user_id' => $user->id, 'name' => 'לוח', 'position' => 0]);
        $widget = DashboardWidget::create(['tenant_id' => $tenant->id, 'board_id' => $board->id, 'config' => [], 'position' => 0]);

        $board->delete();

        $this->assertDatabaseMissing('dashboard_widgets', ['id' => $widget->id]);
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=DashboardBoardModelTest`
Expected: FAIL — `Class "App\Models\DashboardBoard" not found` (tables and models don't exist yet).

- [ ] **Step 4: Write the migrations**

Create `backend/database/migrations/2026_08_18_000001_create_dashboard_boards_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('dashboard_boards')) {
            Schema::create('dashboard_boards', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('name', 120);
                $table->unsignedInteger('position')->default(0);
                $table->timestamps();
                $table->index(['tenant_id', 'user_id'], 'dashboard_boards_owner_index');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('dashboard_boards');
    }
};
```

Create `backend/database/migrations/2026_08_18_000002_create_dashboard_widgets_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('dashboard_widgets')) {
            Schema::create('dashboard_widgets', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('board_id')->constrained('dashboard_boards')->cascadeOnDelete();
                $table->json('config');
                $table->unsignedInteger('position')->default(0);
                $table->timestamps();
                $table->index(['tenant_id', 'board_id'], 'dashboard_widgets_board_index');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('dashboard_widgets');
    }
};
```

Create `SCHEMA_DB/2026_08_18_000001_create_dashboard_boards_table.sql`:

```sql
-- Migration: 2026-08-18
-- Purpose: Dashboard boards — a user's personal set of named dashboard layouts,
-- replacing client-only localStorage persistence.

CREATE TABLE IF NOT EXISTS `dashboard_boards` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `position` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    INDEX `dashboard_boards_owner_index` (`tenant_id`, `user_id`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Create `SCHEMA_DB/2026_08_18_000002_create_dashboard_widgets_table.sql`:

```sql
-- Migration: 2026-08-18
-- Purpose: Dashboard widgets — one widget's full config (type/entity/filters/etc.)
-- as an opaque JSON blob, belonging to a dashboard_boards row.

CREATE TABLE IF NOT EXISTS `dashboard_widgets` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `board_id` BIGINT UNSIGNED NOT NULL,
    `config` JSON NOT NULL,
    `position` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    INDEX `dashboard_widgets_board_index` (`tenant_id`, `board_id`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`board_id`) REFERENCES `dashboard_boards`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 5: Write the models**

Create `backend/app/Models/DashboardBoard.php`:

```php
<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DashboardBoard extends Model
{
    use HasTenantScope;

    protected $fillable = ['tenant_id', 'user_id', 'name', 'position'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function widgets(): HasMany
    {
        return $this->hasMany(DashboardWidget::class, 'board_id')->orderBy('position');
    }
}
```

Create `backend/app/Models/DashboardWidget.php`:

```php
<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DashboardWidget extends Model
{
    use HasTenantScope;

    protected $fillable = ['tenant_id', 'board_id', 'config', 'position'];

    protected $casts = ['config' => 'array'];

    public function board(): BelongsTo
    {
        return $this->belongsTo(DashboardBoard::class, 'board_id');
    }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && php artisan test --filter=DashboardBoardModelTest`
Expected: PASS — 3 tests.

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add backend/database/migrations/2026_08_18_000001_create_dashboard_boards_table.php backend/database/migrations/2026_08_18_000002_create_dashboard_widgets_table.php SCHEMA_DB/2026_08_18_000001_create_dashboard_boards_table.sql SCHEMA_DB/2026_08_18_000002_create_dashboard_widgets_table.sql backend/app/Models/DashboardBoard.php backend/app/Models/DashboardWidget.php backend/tests/Feature/DashboardBoardModelTest.php
git commit -m "feat: dashboard_boards/dashboard_widgets tables and models"
```

---

### Task 5: Board persistence — CRUD controller + routes

**Files:**
- Create: `backend/app/Http/Controllers/DashboardBoardController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/DashboardBoardControllerTest.php`

**Interfaces:**
- Consumes: `DashboardBoard`, `DashboardWidget` (Task 4).
- Produces:
  - `GET /api/dashboards` → `{success, data: [{id, name, position, widgets: [{id, config, position}, ...]}, ...]}` — only the current user's own boards, ordered by `position`.
  - `POST /api/dashboards` → body `{name}` → creates a board owned by the current user, `position` = current max+1. Returns `{success, data: {id, name, position, widgets: []}}`, 201.
  - `PUT /api/dashboards/{board}` → body `{name?}` → renames. 403 if the board isn't the current user's. Returns `{success, data: {...}}`.
  - `DELETE /api/dashboards/{board}` → 403 if not owner. 204 on success. Widgets cascade-delete via the FK.
  - `POST /api/dashboards/{board}/widgets` → body `{config}` (arbitrary JSON-able array) → creates a widget on that board, `position` = current max+1 within the board. 403 if board not owned. Returns `{success, data: {id, config, position}}`, 201.
  - `PUT /api/dashboards/{board}/widgets/{widget}` → body `{config}` → replaces the widget's config. 403 if board/widget not owned or widget doesn't belong to that board.
  - `DELETE /api/dashboards/{board}/widgets/{widget}` → 403 if not owned. 204 on success.
  - All routes behind `auth:sanctum` + `tenant` middleware (the standard authenticated group — mirror how `/saved-views` routes are registered, no extra `permission:` middleware, ownership is enforced inside the controller exactly like `SavedViewController` does).

- [ ] **Step 1: Read `SavedViewController` and its routes for the exact pattern to mirror**

Read `backend/app/Http/Controllers/SavedViewController.php` in full, and `backend/routes/api.php` around the `/saved-views` routes (search for `SavedViewController`) — this plan's controller must match its ownership-check style and response envelope exactly.

- [ ] **Step 2: Write the failing test**

Create `backend/tests/Feature/DashboardBoardControllerTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\DashboardBoard;
use App\Models\DashboardWidget;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DashboardBoardControllerTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private User $userA;
    private User $userB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'DB Tenant', 'subdomain' => 'dbctrl', 'status' => 'active']);
        app()->instance('current_tenant_id', $this->tenant->id);

        $this->userA = User::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'email' => 'a@dbctrl.test', 'password' => Hash::make('x'), 'role' => 'admin']);
        $this->userB = User::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'email' => 'b@dbctrl.test', 'password' => Hash::make('x'), 'role' => 'admin']);
    }

    private function asUser(User $user)
    {
        return $this->actingAs($user)->withHeaders(['X-Tenant' => 'dbctrl']);
    }

    public function test_index_returns_only_own_boards_with_nested_widgets(): void
    {
        $mine   = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שלי', 'position' => 0]);
        DashboardWidget::create(['tenant_id' => $this->tenant->id, 'board_id' => $mine->id, 'config' => ['title' => 'w1'], 'position' => 0]);
        DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userB->id, 'name' => 'לא שלי', 'position' => 0]);

        $resp = $this->asUser($this->userA)->getJson('/api/dashboards');

        $resp->assertOk();
        $names = collect($resp->json('data'))->pluck('name')->all();
        $this->assertSame(['שלי'], $names);
        $this->assertCount(1, $resp->json('data.0.widgets'));
    }

    public function test_store_creates_board_owned_by_current_user(): void
    {
        $resp = $this->asUser($this->userA)->postJson('/api/dashboards', ['name' => 'לוח חדש']);

        $resp->assertCreated();
        $this->assertDatabaseHas('dashboard_boards', ['name' => 'לוח חדש', 'user_id' => $this->userA->id]);
    }

    public function test_update_rejects_non_owner(): void
    {
        $board = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שם', 'position' => 0]);

        $this->asUser($this->userB)->putJson("/api/dashboards/{$board->id}", ['name' => 'גנוב'])
            ->assertStatus(403);
    }

    public function test_destroy_cascades_widgets(): void
    {
        $board  = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שם', 'position' => 0]);
        $widget = DashboardWidget::create(['tenant_id' => $this->tenant->id, 'board_id' => $board->id, 'config' => [], 'position' => 0]);

        $this->asUser($this->userA)->deleteJson("/api/dashboards/{$board->id}")->assertNoContent();

        $this->assertDatabaseMissing('dashboard_boards', ['id' => $board->id]);
        $this->assertDatabaseMissing('dashboard_widgets', ['id' => $widget->id]);
    }

    public function test_store_widget_appends_to_board(): void
    {
        $board = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שם', 'position' => 0]);

        $resp = $this->asUser($this->userA)->postJson("/api/dashboards/{$board->id}/widgets", [
            'config' => ['type' => 'bar', 'entity' => 'lead'],
        ]);

        $resp->assertCreated();
        $this->assertDatabaseHas('dashboard_widgets', ['board_id' => $board->id]);
    }

    public function test_store_widget_rejects_non_owner_board(): void
    {
        $board = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שם', 'position' => 0]);

        $this->asUser($this->userB)->postJson("/api/dashboards/{$board->id}/widgets", ['config' => []])
            ->assertStatus(403);
    }

    public function test_update_widget_replaces_config(): void
    {
        $board  = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שם', 'position' => 0]);
        $widget = DashboardWidget::create(['tenant_id' => $this->tenant->id, 'board_id' => $board->id, 'config' => ['title' => 'ישן'], 'position' => 0]);

        $this->asUser($this->userA)
            ->putJson("/api/dashboards/{$board->id}/widgets/{$widget->id}", ['config' => ['title' => 'חדש']])
            ->assertOk();

        $this->assertSame('חדש', $widget->fresh()->config['title']);
    }

    public function test_destroy_widget(): void
    {
        $board  = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שם', 'position' => 0]);
        $widget = DashboardWidget::create(['tenant_id' => $this->tenant->id, 'board_id' => $board->id, 'config' => [], 'position' => 0]);

        $this->asUser($this->userA)->deleteJson("/api/dashboards/{$board->id}/widgets/{$widget->id}")->assertNoContent();

        $this->assertDatabaseMissing('dashboard_widgets', ['id' => $widget->id]);
    }

    public function test_requires_authentication(): void
    {
        $this->getJson('/api/dashboards')->assertStatus(401);
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=DashboardBoardControllerTest`
Expected: FAIL — 404s, routes don't exist.

- [ ] **Step 4: Write the controller**

Create `backend/app/Http/Controllers/DashboardBoardController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Models\DashboardBoard;
use App\Models\DashboardWidget;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardBoardController extends Controller
{
    private function ownedBoard(int $boardId, int $userId): DashboardBoard
    {
        $board = DashboardBoard::findOrFail($boardId);
        abort_unless($board->user_id === $userId, 403);

        return $board;
    }

    public function index(Request $request): JsonResponse
    {
        $boards = DashboardBoard::where('user_id', $request->user()->id)
            ->orderBy('position')
            ->with('widgets')
            ->get();

        return response()->json(['success' => true, 'data' => $boards]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => 'required|string|max:120']);

        $nextPosition = (int) DashboardBoard::where('user_id', $request->user()->id)->max('position') + 1;

        $board = DashboardBoard::create([
            'tenant_id' => app('current_tenant_id'),
            'user_id'   => $request->user()->id,
            'name'      => $data['name'],
            'position'  => $nextPosition,
        ]);

        return response()->json(['success' => true, 'data' => $board->load('widgets')], 201);
    }

    public function update(Request $request, int $board): JsonResponse
    {
        $model = $this->ownedBoard($board, $request->user()->id);
        $data  = $request->validate(['name' => 'sometimes|string|max:120']);

        $model->update($data);

        return response()->json(['success' => true, 'data' => $model->fresh('widgets')]);
    }

    public function destroy(Request $request, int $board): JsonResponse
    {
        $model = $this->ownedBoard($board, $request->user()->id);
        $model->delete();

        return response()->json(null, 204);
    }

    public function storeWidget(Request $request, int $board): JsonResponse
    {
        $model = $this->ownedBoard($board, $request->user()->id);
        $data  = $request->validate(['config' => 'required|array']);

        $nextPosition = (int) DashboardWidget::where('board_id', $model->id)->max('position') + 1;

        $widget = DashboardWidget::create([
            'tenant_id' => app('current_tenant_id'),
            'board_id'  => $model->id,
            'config'    => $data['config'],
            'position'  => $nextPosition,
        ]);

        return response()->json(['success' => true, 'data' => $widget], 201);
    }

    public function updateWidget(Request $request, int $board, int $widget): JsonResponse
    {
        $model      = $this->ownedBoard($board, $request->user()->id);
        $widgetModel = DashboardWidget::where('board_id', $model->id)->findOrFail($widget);
        $data       = $request->validate(['config' => 'required|array']);

        $widgetModel->update(['config' => $data['config']]);

        return response()->json(['success' => true, 'data' => $widgetModel->fresh()]);
    }

    public function destroyWidget(Request $request, int $board, int $widget): JsonResponse
    {
        $model       = $this->ownedBoard($board, $request->user()->id);
        $widgetModel = DashboardWidget::where('board_id', $model->id)->findOrFail($widget);
        $widgetModel->delete();

        return response()->json(null, 204);
    }
}
```

- [ ] **Step 5: Register the routes**

In `backend/routes/api.php`, add the import next to the other controller imports:

```php
use App\Http\Controllers\DashboardBoardController;
```

Find the `/saved-views` routes block (search for `SavedViewController::class, 'index'`) and add this block immediately after it (same middleware group — inside the authenticated `tenant`+`auth:sanctum` group those routes already live in, no `permission:` middleware, matching `/saved-views`'s own pattern exactly):

```php

    // Dashboard boards — server-side persistence for the widget builder
    Route::get('/dashboards',                              [DashboardBoardController::class, 'index']);
    Route::post('/dashboards',                              [DashboardBoardController::class, 'store']);
    Route::put('/dashboards/{board}',                       [DashboardBoardController::class, 'update']);
    Route::delete('/dashboards/{board}',                    [DashboardBoardController::class, 'destroy']);
    Route::post('/dashboards/{board}/widgets',               [DashboardBoardController::class, 'storeWidget']);
    Route::put('/dashboards/{board}/widgets/{widget}',       [DashboardBoardController::class, 'updateWidget']);
    Route::delete('/dashboards/{board}/widgets/{widget}',    [DashboardBoardController::class, 'destroyWidget']);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=DashboardBoardControllerTest`
Expected: PASS — 9 tests.

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: PASS, no regressions.

- [ ] **Step 8: Commit**

```bash
git add backend/app/Http/Controllers/DashboardBoardController.php backend/routes/api.php backend/tests/Feature/DashboardBoardControllerTest.php
git commit -m "feat: dashboard board/widget CRUD endpoints"
```

---

### Task 6: Drill-down modal

**Files:**
- Create: `frontend/src/pages/reports/DrillDownModal.jsx`
- Modify: `frontend/src/pages/reports/WidgetCard.jsx`
- Modify: `frontend/src/api/dashboard.js`
- Test: `frontend/src/pages/reports/drillDown.test.js`

**Interfaces:**
- Consumes: `widget.entity`, `widget.conditions`, `widget.orConditions`, and the `resolvedRange` field now present in `widgetData` responses (Task 1, already deployed backend-side).
- Produces: `drillDownEntityRoute(entity: string): string|null` in a new small pure module (`frontend/src/lib/widgetConfig.js` — add to the existing file) mapping `'lead'→'/leads'`, `'client'→'/clients'`, `'contact'→'/contacts'`, `'task'→'/tasks'`, `'activity'→null` (no generic list endpoint exists for activities — the modal shows a message instead of a table for that entity). `dashboardApi.drillDown(entity, params)` in `dashboard.js`. `<DrillDownModal widget={widget} segment={{key,label}} onClose={fn} />`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/reports/drillDown.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { drillDownEntityRoute, drillDownParams } from '../../lib/widgetConfig'

describe('drillDownEntityRoute', () => {
  it('maps known entities to their list endpoint', () => {
    expect(drillDownEntityRoute('lead')).toBe('/leads')
    expect(drillDownEntityRoute('client')).toBe('/clients')
    expect(drillDownEntityRoute('contact')).toBe('/contacts')
    expect(drillDownEntityRoute('task')).toBe('/tasks')
  })

  it('returns null for activity — no generic list endpoint exists', () => {
    expect(drillDownEntityRoute('activity')).toBeNull()
  })

  it('returns null for an unknown entity', () => {
    expect(drillDownEntityRoute('invoice')).toBeNull()
  })
})

describe('drillDownParams', () => {
  it('combines the widget conditions with a segment equals-condition', () => {
    const widget = { displayField: 'source', conditions: [{ field: 'status', operator: 'equals', value: 'open' }] }
    const params = drillDownParams(widget, { key: 'facebook' })

    const conditions = JSON.parse(params.conditions)
    expect(conditions).toEqual([
      { field: 'status', operator: 'equals', value: 'open' },
      { field: 'source', operator: 'equals', value: 'facebook' },
    ])
  })

  it('includes orConditions when present', () => {
    const widget = { displayField: 'source', conditions: [], orConditions: [{ field: 'name', operator: 'contains', value: 'x' }] }
    const params = drillDownParams(widget, { key: 'facebook' })

    expect(JSON.parse(params.orConditions)).toEqual([{ field: 'name', operator: 'contains', value: 'x' }])
  })

  it('translates a resolvedRange into date_from/date_to', () => {
    const widget = { displayField: 'source', conditions: [] }
    const params = drillDownParams(widget, { key: 'facebook' }, { from: '2026-08-01', to: '2026-08-31' })

    expect(params.date_from).toBe('2026-08-01')
    expect(params.date_to).toBe('2026-08-31')
  })

  it('omits a null segment key from the conditions (ungrouped total row)', () => {
    const widget = { displayField: 'source', conditions: [] }
    const params = drillDownParams(widget, { key: null })

    expect(JSON.parse(params.conditions)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/reports/drillDown.test.js`
Expected: FAIL — `drillDownEntityRoute`/`drillDownParams` not exported from `widgetConfig.js`.

- [ ] **Step 3: Add the pure helpers to `widgetConfig.js`**

In `frontend/src/lib/widgetConfig.js`, append (after `emptyWidgetDraft`):

```js
const DRILL_DOWN_ROUTES = { lead: '/leads', client: '/clients', contact: '/contacts', task: '/tasks' }

export function drillDownEntityRoute(entity) {
  return DRILL_DOWN_ROUTES[entity] ?? null
}

export function drillDownParams(widget, segment, resolvedRange) {
  const conditions = [...(widget.conditions ?? [])]
  if (widget.displayField && segment?.key !== null && segment?.key !== undefined) {
    conditions.push({ field: widget.displayField, operator: 'equals', value: segment.key })
  }

  const params = { conditions: JSON.stringify(conditions) }
  if (widget.orConditions?.length) params.orConditions = JSON.stringify(widget.orConditions)
  if (resolvedRange?.from) params.date_from = resolvedRange.from
  if (resolvedRange?.to) params.date_to = resolvedRange.to

  return params
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/reports/drillDown.test.js`
Expected: PASS — 8 tests.

- [ ] **Step 5: Add the API client method**

In `frontend/src/api/dashboard.js`, add one entry (each entity's own list endpoint accepts `conditions`/`date_from`/`date_to` already — no backend change needed, this just calls the right one):

```js
  entityList: (route, params) => client.get(route, { params }),
```

- [ ] **Step 6: Write the drill-down modal component**

Create `frontend/src/pages/reports/DrillDownModal.jsx`:

```jsx
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../api/dashboard'
import { drillDownEntityRoute, drillDownParams } from '../../lib/widgetConfig'

const ENTITY_TABLE_COLUMNS = {
  lead:    [['name', 'שם'], ['phone', 'טלפון'], ['email', 'אימייל'], ['source', 'מקור'], ['status', 'סטטוס']],
  client:  [['name', 'שם'], ['phone', 'טלפון'], ['email', 'אימייל'], ['company', 'חברה']],
  contact: [['name', 'שם'], ['phone', 'טלפון'], ['email', 'אימייל'], ['company', 'חברה']],
  task:    [['title', 'כותרת'], ['status', 'סטטוס'], ['priority', 'עדיפות']],
}

export default function DrillDownModal({ widget, segment, resolvedRange, onClose }) {
  const route = drillDownEntityRoute(widget.entity)

  const { data, isLoading } = useQuery({
    queryKey: ['drill-down', widget.entity, widget.displayField, segment?.key, resolvedRange?.from, resolvedRange?.to],
    queryFn:  () => dashboardApi.entityList(route, drillDownParams(widget, segment, resolvedRange))
      .then(r => {
        const raw = r.data?.data
        return Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : [])
      }),
    enabled: !!route,
  })

  const columns = ENTITY_TABLE_COLUMNS[widget.entity] ?? []
  const title = segment?.label ? `${widget.title} - ${segment.label}` : widget.title

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col overflow-hidden" dir="rtl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!route ? (
            <p className="text-sm text-gray-400 text-center py-8">אין תצוגת רשימה זמינה לישות זו</p>
          ) : isLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">טוען...</p>
          ) : !data?.length ? (
            <p className="text-sm text-gray-400 text-center py-8">אין רשומות תואמות</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  {columns.map(([key, label]) => (
                    <th key={key} className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(row => (
                  <tr key={row.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                    {columns.map(([key]) => (
                      <td key={key} className="py-2 px-2 text-gray-700 dark:text-gray-200">{row[key] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Wire click handlers into `WidgetCard.jsx`**

In `frontend/src/pages/reports/WidgetCard.jsx`:

Add the import at the top:

```jsx
import DrillDownModal from './DrillDownModal'
```

In `ChartWidgetCard`, add drill-down state and pass an `onSegmentClick` down to `renderChart`. Replace:

```jsx
function ChartWidgetCard({ widget, onDelete, onUpdate, data, isLoading }) {
  const [hovered, setHovered] = useState(false)
```

with:

```jsx
function ChartWidgetCard({ widget, onDelete, onUpdate, data, isLoading, resolvedRange }) {
  const [hovered, setHovered]   = useState(false)
  const [drillDown, setDrillDown] = useState(null)
```

and replace the line `{isLoading ? <Skeleton /> : renderChart(widget, data)}` with:

```jsx
      {isLoading ? <Skeleton /> : renderChart(widget, data, key => setDrillDown({ key, label: key ?? 'ריק' }))}
      {drillDown && (
        <DrillDownModal
          widget={widget}
          segment={drillDown}
          resolvedRange={resolvedRange}
          onClose={() => setDrillDown(null)}
        />
      )}
```

Now update `renderChart` and the individual chart components to accept and call an `onSegmentClick(key)` callback. Replace the whole `renderChart` function:

```jsx
function renderChart(widget, data, onSegmentClick) {
  switch (widget.type) {
    case 'bar':   return <ChartBar  data={data} color={widget.color} onSegmentClick={onSegmentClick} />
    case 'bar_h': return <ChartBarH data={data} color={widget.color} onSegmentClick={onSegmentClick} />
    case 'pie':   return <ChartPie  data={data} onSegmentClick={onSegmentClick} />
    case 'line':  return <ChartLine data={data} color={widget.color} onSegmentClick={onSegmentClick} />
    case 'table': return <ChartTable data={data} onSegmentClick={onSegmentClick} />
    default:      return <Empty />
  }
}
```

Recharts elements accept an `onClick` prop that receives the data point. Update `ChartBar`'s `<Bar>` element — find:

```jsx
            <Bar dataKey="total" fill={color ?? '#2398c2'} radius={[4, 4, 0, 0]} />
```

replace with:

```jsx
            <Bar dataKey="total" fill={color ?? '#2398c2'} radius={[4, 4, 0, 0]}
              cursor={onSegmentClick ? 'pointer' : 'default'}
              onClick={onSegmentClick ? (d) => onSegmentClick(d?.key ?? d?.name ?? null) : undefined} />
```

Update `ChartBarH`'s `<Bar>` the same way — find:

```jsx
        <Bar dataKey="total" fill={color ?? '#8b5cf6'} radius={[0, 4, 4, 0]} />
```

replace with:

```jsx
        <Bar dataKey="total" fill={color ?? '#8b5cf6'} radius={[0, 4, 4, 0]}
          cursor={onSegmentClick ? 'pointer' : 'default'}
          onClick={onSegmentClick ? (d) => onSegmentClick(d?.key ?? d?.name ?? null) : undefined} />
```

Update `ChartPie`'s `<Pie>` — find:

```jsx
          <Pie data={data} dataKey="total" nameKey={nameKey} cx="50%" cy="50%"
            outerRadius={preview ? 60 : 85} labelLine={false} label={makePieLabel(total)}>
```

replace with:

```jsx
          <Pie data={data} dataKey="total" nameKey={nameKey} cx="50%" cy="50%"
            outerRadius={preview ? 60 : 85} labelLine={false} label={makePieLabel(total)}
            cursor={onSegmentClick ? 'pointer' : 'default'}
            onClick={onSegmentClick ? (d) => onSegmentClick(d?.key ?? d?.name ?? null) : undefined}>
```

`ChartLine` and `ChartTable` accept `onSegmentClick` in their signatures for consistency but the plan does not wire click behavior into them — a line chart's points and a table's rows are visually less obvious click targets, and the design spec assumed pie/bar drill-down only; leave `ChartLine`/`ChartTable`'s function signatures accepting the new prop (so `renderChart`'s uniform call above doesn't error) without using it. Update their signatures only:

```jsx
function ChartLine({ data, color, preview, onSegmentClick }) {
```

```jsx
function ChartTable({ data, onSegmentClick }) {
```

(`onSegmentClick` is simply unused in both — no lint issue since it's a named destructured prop, not an unused local variable.)

Finally, thread `resolvedRange` from the widget's fetch into `ChartWidgetCard`. In the main `WidgetCard` export, the `queryFn` for non-legacy widgets currently returns only `payload.rows.map(...)` for chart widgets — it needs to also expose `payload.resolvedRange` up to `ChartWidgetCard`. Change the `data` shape returned by the query for chart widgets to carry both, then unpack at the render site. Find:

```jsx
    queryFn: () => legacy
      ? fetchWidgetData(widget.dataSource, legacyParams)
      : dashboardApi.widgetData(newParams).then(r => {
          const payload = r.data.data
          // KPI widgets read a single number; charts read the grouped rows
          return widget.type === 'kpi'
            ? payload.total
            : payload.rows.map(row => ({ name: row.label, total: row.total, color: row.color }))
        }),
```

replace with:

```jsx
    queryFn: () => legacy
      ? fetchWidgetData(widget.dataSource, legacyParams)
      : dashboardApi.widgetData(newParams).then(r => {
          const payload = r.data.data
          // KPI widgets read a single number; charts read the grouped rows plus
          // the resolved date range (drill-down needs it to scope its own query).
          if (widget.type === 'kpi') return payload.total
          return {
            rows: payload.rows.map(row => ({ name: row.label, key: row.key, total: row.total, color: row.color })),
            resolvedRange: payload.resolvedRange ?? null,
          }
        }),
```

This changes the `data` shape for non-legacy chart widgets from a flat array to `{rows, resolvedRange}`. Update the two call sites that pass `data` onward. First, in the main export's non-preview chart branch, find:

```jsx
  return (
    <ChartWidgetCard
      widget={widget}
      onDelete={onDelete}
      onUpdate={onUpdate}
      data={data}
      isLoading={isLoading}
    />
  )
```

replace with:

```jsx
  const chartData     = legacy ? data : data?.rows
  const resolvedRange = legacy ? null : data?.resolvedRange

  return (
    <ChartWidgetCard
      widget={widget}
      onDelete={onDelete}
      onUpdate={onUpdate}
      data={chartData}
      isLoading={isLoading}
      resolvedRange={resolvedRange}
    />
  )
```

And the preview branch — find:

```jsx
  if (preview) {
    return (
      <div className="w-full">
        {renderPreviewChart(widget, data, isLoading)}
      </div>
    )
  }
```

replace with:

```jsx
  if (preview) {
    const previewData = legacy ? data : data?.rows
    return (
      <div className="w-full">
        {renderPreviewChart(widget, previewData, isLoading)}
      </div>
    )
  }
```

(`renderPreviewChart` never calls `onSegmentClick` — preview charts inside the Add Widget modal aren't clickable, which is correct: there's nothing to drill into for an unsaved widget.)

Also note: `data[0]?.total` in `KpiCard`/`renderPreviewChart`'s KPI branch already worked because KPI `queryFn` still returns a bare number (`payload.total`), unchanged by this task — only chart widgets' shape changed.

- [ ] **Step 8: Run the full frontend suite and build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: all tests pass (including the 3 pre-existing suites), build succeeds with no new errors.

- [ ] **Step 9: Manual verification against the demo tenant**

Start the backend (`cd backend && php artisan serve` or however this repo's dev workflow already runs it) and the frontend dev server, log in to the demo tenant, open a board with a bar-chart widget grouped by an enum field (e.g. leads by source), click a bar, and confirm a modal titled `<widget title> - <segment label>` opens showing a leads table filtered to that segment. Click a pie slice on a pie widget too. Report what you saw.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/reports/DrillDownModal.jsx frontend/src/pages/reports/WidgetCard.jsx frontend/src/api/dashboard.js frontend/src/lib/widgetConfig.js frontend/src/pages/reports/drillDown.test.js
git commit -m "feat: drill-down modal on chart segment click"
```

---

### Task 7: AND/OR condition groups UI

**Files:**
- Modify: `frontend/src/pages/reports/AddWidgetModal.jsx`
- Modify: `frontend/src/lib/widgetConfig.js`
- Modify: `frontend/src/lib/widgetConfig.test.js`

**Interfaces:**
- Consumes: `widgetDataParams()` (existing, this task extends it).
- Produces: `widgetDataParams()` gains an `orConditions` param (mirrors the existing `conditions` handling) when `widget.orConditions?.length`. `emptyWidgetDraft()` gains `orConditions: []`.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/lib/widgetConfig.test.js` (inside the existing `describe('widgetDataParams', ...)` block):

```js
  it('includes orConditions when present', () => {
    const params = widgetDataParams({
      entity: 'lead',
      orConditions: [{ field: 'source', operator: 'equals', value: 'website' }],
    })

    expect(JSON.parse(params.orConditions)).toEqual([{ field: 'source', operator: 'equals', value: 'website' }])
  })

  it('omits orConditions when empty', () => {
    const params = widgetDataParams({ entity: 'lead', orConditions: [] })

    expect(params.orConditions).toBeUndefined()
  })
```

And inside the existing `describe('emptyWidgetDraft', ...)` block:

```js
  it('includes an empty orConditions array', () => {
    expect(emptyWidgetDraft().orConditions).toEqual([])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/widgetConfig.test.js`
Expected: FAIL — the 3 new assertions fail (`orConditions` undefined everywhere).

- [ ] **Step 3: Update `widgetConfig.js`**

In `frontend/src/lib/widgetConfig.js`, find:

```js
  if (widget.conditions?.length) {
    params.conditions = JSON.stringify(widget.conditions)
  }

  return params
}
```

replace with:

```js
  if (widget.conditions?.length) {
    params.conditions = JSON.stringify(widget.conditions)
  }
  if (widget.orConditions?.length) {
    params.orConditions = JSON.stringify(widget.orConditions)
  }

  return params
}
```

Find `emptyWidgetDraft`'s `conditions: [],` line and add a sibling:

```js
    conditions:   [],
    orConditions: [],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/widgetConfig.test.js`
Expected: PASS.

- [ ] **Step 5: Update `AddWidgetModal.jsx` UI**

In `frontend/src/pages/reports/AddWidgetModal.jsx`, the filter section currently renders one flat list under "סינון רשומות". Replace the whole block — find (this is the full JSX block starting at the `<div>` wrapping the `סינון רשומות` label through its closing `</div>`, i.e. the entire condition-list section):

```jsx
            <div>
              <label className={LABEL_CLASS}>סינון רשומות</label>
              <div className="space-y-2">
                {draft.conditions.map((row, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <select value={row.field} onChange={e => updateCondition(i, { field: e.target.value, value: '' })}
                      className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                      {Object.entries(filterFields).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                    </select>
                    <select value={row.operator} onChange={e => updateCondition(i, { operator: e.target.value })}
                      className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                      {CONDITION_OPERATORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    {needsConditionValue(row.operator) && (
                      <FilterValueInput
                        field={filterFields[row.field]}
                        lookups={meta?.lookups}
                        value={row.value}
                        onChange={v => updateCondition(i, { value: v })}
                      />
                    )}
                    <button type="button" onClick={() => removeCondition(i)}
                      className="text-gray-300 hover:text-red-500 flex-shrink-0 px-0.5">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addCondition} className="mt-1.5 text-xs text-[#2398c2] hover:underline">
                + הוסף סינון
              </button>
            </div>
```

replace with (extracting the row into a small local render function shared by both groups, and rendering two labelled groups):

```jsx
            <div>
              <label className={LABEL_CLASS}>סינון רשומות</label>

              <div className="mb-3">
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5 underline decoration-dotted">
                  התנאים שכולם חייבים להתקיים
                </p>
                <div className="space-y-2">
                  {draft.conditions.map((row, i) => (
                    <ConditionRow key={i} row={row} filterFields={filterFields} lookups={meta?.lookups}
                      onChange={p => updateCondition(i, p)} onRemove={() => removeCondition(i)} />
                  ))}
                </div>
                <button type="button" onClick={addCondition} className="mt-1.5 text-xs text-[#2398c2] hover:underline">
                  + הוסף סינון
                </button>
              </div>

              <div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5 underline decoration-dotted">
                  תנאים שלפחות אחד מהם מתקיים
                </p>
                <div className="space-y-2">
                  {draft.orConditions.map((row, i) => (
                    <ConditionRow key={i} row={row} filterFields={filterFields} lookups={meta?.lookups}
                      onChange={p => updateOrCondition(i, p)} onRemove={() => removeOrCondition(i)} />
                  ))}
                </div>
                <button type="button" onClick={addOrCondition} className="mt-1.5 text-xs text-[#2398c2] hover:underline">
                  + הוסף סינון
                </button>
              </div>
            </div>
```

Now add the `ConditionRow` component and the four `orConditions` CRUD functions. Add `ConditionRow` above `export default function AddWidgetModal` (after the `needsConditionValue` const):

```jsx
function ConditionRow({ row, filterFields, lookups, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-1.5">
      <select value={row.field} onChange={e => onChange({ field: e.target.value, value: '' })}
        className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
        {Object.entries(filterFields).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
      </select>
      <select value={row.operator} onChange={e => onChange({ operator: e.target.value })}
        className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
        {CONDITION_OPERATORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {needsConditionValue(row.operator) && (
        <FilterValueInput field={filterFields[row.field]} lookups={lookups} value={row.value}
          onChange={v => onChange({ value: v })} />
      )}
      <button type="button" onClick={onRemove} className="text-gray-300 hover:text-red-500 flex-shrink-0 px-0.5">×</button>
    </div>
  )
}
```

Find the existing `addCondition`/`removeCondition`/`updateCondition` functions:

```jsx
  const addCondition    = () => patch({ conditions: [...draft.conditions, { field: Object.keys(filterFields)[0] ?? '', operator: 'equals', value: '' }] })
  const removeCondition = (i) => patch({ conditions: draft.conditions.filter((_, idx) => idx !== i) })
  const updateCondition = (i, p) => patch({ conditions: draft.conditions.map((c, idx) => idx === i ? { ...c, ...p } : c) })
```

and add the OR-group siblings right after:

```jsx
  const addOrCondition    = () => patch({ orConditions: [...draft.orConditions, { field: Object.keys(filterFields)[0] ?? '', operator: 'equals', value: '' }] })
  const removeOrCondition = (i) => patch({ orConditions: draft.orConditions.filter((_, idx) => idx !== i) })
  const updateOrCondition = (i, p) => patch({ orConditions: draft.orConditions.map((c, idx) => idx === i ? { ...c, ...p } : c) })
```

Finally, `validConditions` currently filters only `draft.conditions`. Find:

```jsx
  const validConditions = draft.conditions.filter(c =>
    c.field && c.operator && (!needsConditionValue(c.operator) || String(c.value ?? '').trim() !== '')
  )
```

add a sibling right after:

```jsx
  const validOrConditions = draft.orConditions.filter(c =>
    c.field && c.operator && (!needsConditionValue(c.operator) || String(c.value ?? '').trim() !== '')
  )
```

Then find every place `conditions: validConditions` is used (the `previewWidget` object and `handleSave`'s `onSave` call) and add `orConditions: validOrConditions` alongside each:

```jsx
  const previewWidget = {
    ...draft,
    id:         '__preview__',
    title:      draft.title || 'תצוגה מקדימה',
    conditions: validConditions,
    orConditions: validOrConditions,
  }
```

```jsx
  function handleSave() {
    if (!draft.title.trim()) {
      toast.warn('נא להזין כותרת')
      return
    }
    onSave({ ...draft, title: draft.title.trim(), conditions: validConditions, orConditions: validOrConditions })
  }
```

Also update `handleEntityChange` (which resets `conditions: []` when the entity changes) to reset `orConditions` too — find:

```jsx
      timePeriod:   { field: firstDate, operator: '', value: '' },
      conditions:   [],
    })
```

replace with:

```jsx
      timePeriod:   { field: firstDate, operator: '', value: '' },
      conditions:   [],
      orConditions: [],
    })
```

- [ ] **Step 6: Run the full frontend suite and build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: all pass, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/reports/AddWidgetModal.jsx frontend/src/lib/widgetConfig.js frontend/src/lib/widgetConfig.test.js
git commit -m "feat: AND/OR condition groups in Add Widget modal"
```

---

### Task 8: Second grouping dimension UI + multi-series charts

**Files:**
- Modify: `frontend/src/pages/reports/AddWidgetModal.jsx`
- Modify: `frontend/src/pages/reports/WidgetCard.jsx`
- Modify: `frontend/src/lib/widgetConfig.js`
- Modify: `frontend/src/lib/widgetConfig.test.js`

**Interfaces:**
- Consumes: the backend's `seriesKeys`/`rows[].series` shape from Task 3 (already deployed backend-side by the time this task runs, since backend tasks 1-5 precede frontend tasks 6-11 in this plan's ordering).
- Produces: `widgetDataParams()` includes `groupBy` (JSON) when `widget.groupBy?.field` set. `WidgetCard`'s chart fetch detects a `seriesKeys` response and pivots it into Recharts' multi-series row shape (`{name, <seriesLabel1>: val, <seriesLabel2>: val, ...}`) instead of the flat `{name, total}` shape, and `ChartBar` gains a `stacked` prop to render one `<Bar>` per series (stacked via Recharts' `stackId` when `widget.variant === 'stacked'`, side-by-side otherwise).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/lib/widgetConfig.test.js` (inside `describe('widgetDataParams', ...)`):

```js
  it('includes groupBy when a second dimension is set', () => {
    const params = widgetDataParams({ entity: 'lead', groupBy: { field: 'assigned_to' } })

    expect(JSON.parse(params.groupBy)).toEqual({ field: 'assigned_to' })
  })

  it('omits groupBy when its field is empty', () => {
    const params = widgetDataParams({ entity: 'lead', groupBy: { field: '' } })

    expect(params.groupBy).toBeUndefined()
  })
```

Add a new top-level `describe` block for the pivot helper (this is the pure function `WidgetCard.jsx` will use — extracting it into `widgetConfig.js` keeps it testable without rendering React):

```js
describe('pivotSeriesRows', () => {
  it('turns backend series rows into Recharts multi-series rows', () => {
    const rows = [
      { key: 'facebook', label: 'פייסבוק', color: null, series: { '1': 2, '2': 1 } },
      { key: 'website',  label: 'אתר',      color: null, series: { '1': 0, '2': 3 } },
    ]
    const seriesKeys = [{ key: '1', label: 'דנה' }, { key: '2', label: 'יוסי' }]

    const pivoted = pivotSeriesRows(rows, seriesKeys)

    expect(pivoted).toEqual([
      { name: 'פייסבוק', 'דנה': 2, 'יוסי': 1 },
      { name: 'אתר', 'דנה': 0, 'יוסי': 3 },
    ])
  })

  it('defaults a missing series value to 0', () => {
    const rows = [{ key: 'a', label: 'א', color: null, series: { '1': 5 } }]
    const seriesKeys = [{ key: '1', label: 'X' }, { key: '2', label: 'Y' }]

    expect(pivotSeriesRows(rows, seriesKeys)).toEqual([{ name: 'א', X: 5, Y: 0 }])
  })
})
```

Import `pivotSeriesRows` at the top of the test file alongside the existing imports (find the existing `import { isLegacyWidget, widgetDataParams, emptyWidgetDraft } from './widgetConfig'` line and add it to that same import statement).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/widgetConfig.test.js`
Expected: FAIL — `groupBy` assertions fail, `pivotSeriesRows` not exported.

- [ ] **Step 3: Update `widgetConfig.js`**

Find the `if (widget.orConditions?.length)` block added in Task 7 and add a `groupBy` block right after it, before `return params`:

```js
  if (widget.groupBy?.field) {
    params.groupBy = JSON.stringify(widget.groupBy)
  }
```

Append `pivotSeriesRows` to the file (after `drillDownParams`, added in Task 6):

```js
export function pivotSeriesRows(rows, seriesKeys) {
  const labelByKey = Object.fromEntries(seriesKeys.map(s => [s.key, s.label]))

  return rows.map(row => {
    const pivoted = { name: row.label }
    for (const s of seriesKeys) {
      pivoted[labelByKey[s.key]] = row.series?.[s.key] ?? 0
    }
    return pivoted
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/widgetConfig.test.js`
Expected: PASS.

- [ ] **Step 5: Wire the fetch pivot into `WidgetCard.jsx`**

In `frontend/src/pages/reports/WidgetCard.jsx`, add the import:

```jsx
import { isLegacyWidget, widgetDataParams, pivotSeriesRows } from '../../lib/widgetConfig'
```

(replace the existing import line that reads `import { isLegacyWidget, widgetDataParams } from '../../lib/widgetConfig'` with the above — same line, one more named import).

Find the `queryFn` block from Task 6 (the one returning `{rows, resolvedRange}` for non-KPI widgets):

```jsx
          if (widget.type === 'kpi') return payload.total
          return {
            rows: payload.rows.map(row => ({ name: row.label, key: row.key, total: row.total, color: row.color })),
            resolvedRange: payload.resolvedRange ?? null,
          }
```

replace with:

```jsx
          if (widget.type === 'kpi') return payload.total
          const rows = payload.seriesKeys
            ? pivotSeriesRows(payload.rows, payload.seriesKeys)
            : payload.rows.map(row => ({ name: row.label, key: row.key, total: row.total, color: row.color }))
          return {
            rows,
            seriesLabels: payload.seriesKeys?.map(s => s.label) ?? null,
            resolvedRange: payload.resolvedRange ?? null,
          }
```

Thread `seriesLabels` down to `ChartWidgetCard` the same way `resolvedRange` was threaded in Task 6. Find (from Task 6's edit):

```jsx
  const chartData     = legacy ? data : data?.rows
  const resolvedRange = legacy ? null : data?.resolvedRange

  return (
    <ChartWidgetCard
      widget={widget}
      onDelete={onDelete}
      onUpdate={onUpdate}
      data={chartData}
      isLoading={isLoading}
      resolvedRange={resolvedRange}
    />
  )
```

replace with:

```jsx
  const chartData     = legacy ? data : data?.rows
  const resolvedRange = legacy ? null : data?.resolvedRange
  const seriesLabels  = legacy ? null : data?.seriesLabels

  return (
    <ChartWidgetCard
      widget={widget}
      onDelete={onDelete}
      onUpdate={onUpdate}
      data={chartData}
      isLoading={isLoading}
      resolvedRange={resolvedRange}
      seriesLabels={seriesLabels}
    />
  )
```

Update `ChartWidgetCard`'s signature and its call to `renderChart` (from Task 6's edit):

```jsx
function ChartWidgetCard({ widget, onDelete, onUpdate, data, isLoading, resolvedRange }) {
```

becomes:

```jsx
function ChartWidgetCard({ widget, onDelete, onUpdate, data, isLoading, resolvedRange, seriesLabels }) {
```

and:

```jsx
      {isLoading ? <Skeleton /> : renderChart(widget, data, key => setDrillDown({ key, label: key ?? 'ריק' }))}
```

becomes:

```jsx
      {isLoading ? <Skeleton /> : renderChart(widget, data, key => setDrillDown({ key, label: key ?? 'ריק' }), seriesLabels)}
```

Update `renderChart` (from Task 6) to accept and forward `seriesLabels` only to `ChartBar` and `ChartBarH` (multi-series only makes sense for bar charts in this plan's scope — pie/line stay single-series):

```jsx
function renderChart(widget, data, onSegmentClick, seriesLabels) {
  switch (widget.type) {
    case 'bar':   return <ChartBar  data={data} color={widget.color} onSegmentClick={onSegmentClick} seriesLabels={seriesLabels} stacked={widget.variant === 'stacked'} />
    case 'bar_h': return <ChartBarH data={data} color={widget.color} onSegmentClick={onSegmentClick} seriesLabels={seriesLabels} stacked={widget.variant === 'stacked'} />
    case 'pie':   return <ChartPie  data={data} onSegmentClick={onSegmentClick} />
    case 'line':  return <ChartLine data={data} color={widget.color} onSegmentClick={onSegmentClick} />
    case 'table': return <ChartTable data={data} onSegmentClick={onSegmentClick} />
    default:      return <Empty />
  }
}
```

Update `ChartBar` to render one `<Bar>` per series when `seriesLabels` is present. Replace the whole function:

```jsx
function ChartBar({ data, color, preview, onSegmentClick, seriesLabels, stacked }) {
  if (!data?.length) return <Empty />
  const h = preview ? 160 : 220
  const hasMultiBars = data[0]?.open !== undefined && data[0]?.closed !== undefined
  const nameKey = Object.keys(data[0] ?? {}).find(k =>
    ['name', 'agent_name', 'source', 'stage'].includes(k)
  ) ?? 'name'

  return (
    <div dir="ltr">
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} strokeOpacity={0.4} />
          <XAxis dataKey={nameKey} tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TT_STYLE} />
          {seriesLabels ? (
            <>
              {seriesLabels.map((label, i) => (
                <Bar key={label} dataKey={label} name={label} fill={PIE_COLORS[i % PIE_COLORS.length]}
                  radius={[4, 4, 0, 0]} stackId={stacked ? 'stack' : undefined} />
              ))}
              <Legend formatter={v => <span style={{ fontSize: 11, color: TICK }}>{v}</span>} />
            </>
          ) : hasMultiBars ? (
            <>
              <Bar dataKey="total"  name="סה״כ"    fill="#2398c2" radius={[4, 4, 0, 0]} />
              <Bar dataKey="open"   name="פתוחים"  fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="closed" name="סגורים"  fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Legend formatter={v => <span style={{ fontSize: 11, color: TICK }}>{v}</span>} />
            </>
          ) : (
            <Bar dataKey="total" fill={color ?? '#2398c2'} radius={[4, 4, 0, 0]}
              cursor={onSegmentClick ? 'pointer' : 'default'}
              onClick={onSegmentClick ? (d) => onSegmentClick(d?.key ?? d?.name ?? null) : undefined} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

(Drill-down on a multi-series bar is intentionally not wired — clicking a specific series-segment within a stacked/grouped bar to drill into that exact `(group, series)` pair is out of scope for this plan; only the single-series bar path keeps `onClick`.)

Update `ChartBarH` the same way — replace the whole function:

```jsx
function ChartBarH({ data, color, preview, onSegmentClick, seriesLabels, stacked }) {
  if (!data?.length) return <Empty />
  const h = preview ? 160 : 240
  const nameKey = Object.keys(data[0] ?? {}).find(k =>
    ['typeLabel', 'name', 'agent_name', 'source', 'stage'].includes(k)
  ) ?? 'name'

  return (
    <div dir="ltr">
      <ResponsiveContainer width="100%" height={h}>
        <BarChart layout="vertical" data={data} margin={{ top: 4, right: 32, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} strokeOpacity={0.4} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: TICK }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey={nameKey} tick={{ fontSize: 11, fill: TICK }} axisLine={false} tickLine={false} width={70} />
          <Tooltip contentStyle={TT_STYLE} />
          {seriesLabels ? (
            <>
              {seriesLabels.map((label, i) => (
                <Bar key={label} dataKey={label} name={label} fill={PIE_COLORS[i % PIE_COLORS.length]}
                  radius={[0, 4, 4, 0]} stackId={stacked ? 'stack' : undefined} />
              ))}
              <Legend formatter={v => <span style={{ fontSize: 11, color: TICK }}>{v}</span>} />
            </>
          ) : (
            <Bar dataKey="total" fill={color ?? '#8b5cf6'} radius={[0, 4, 4, 0]}
              cursor={onSegmentClick ? 'pointer' : 'default'}
              onClick={onSegmentClick ? (d) => onSegmentClick(d?.key ?? d?.name ?? null) : undefined} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 6: Add the UI to `AddWidgetModal.jsx`**

In `frontend/src/pages/reports/AddWidgetModal.jsx`, add a "קיבוץ נתונים" section right after the existing "שדה להצגה" block (bar/bar_h only — a second dimension on pie/line/table isn't rendered by this plan's chart components, so hide the control for those types to avoid a config the UI can't show). Find:

```jsx
            {draft.type !== 'kpi' && (
              <div>
                <label className={LABEL_CLASS}>שדה להצגה</label>
                <select value={draft.displayField} onChange={e => patch({ displayField: e.target.value })} className={SELECT_CLASS}>
                  {Object.entries(groupFields).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                </select>
              </div>
            )}
```

add right after it:

```jsx
            {(draft.type === 'bar' || draft.type === 'bar_h') && (
              <div>
                <label className={LABEL_CLASS}>קיבוץ נתונים (סדרה שנייה)</label>
                <div className="flex gap-2">
                  <select value={draft.groupBy?.field ?? ''}
                    onChange={e => patch({ groupBy: { field: e.target.value, granularity: 'month' } })}
                    className={SELECT_CLASS}>
                    <option value="">ללא</option>
                    {Object.entries(groupFields).filter(([k]) => k !== draft.displayField)
                      .map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                  </select>
                  {groupFields[draft.groupBy?.field]?.type === 'date' && (
                    <select value={draft.groupBy?.granularity ?? 'month'}
                      onChange={e => patch({ groupBy: { ...draft.groupBy, granularity: e.target.value } })}
                      className={SELECT_CLASS}>
                      <option value="day">יום</option>
                      <option value="week">שבוע</option>
                      <option value="month">חודש</option>
                      <option value="year">שנה</option>
                    </select>
                  )}
                </div>
                {draft.groupBy?.field && (
                  <div className="flex gap-3 mt-2">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                      <input type="radio" name="variant" checked={draft.variant !== 'stacked'}
                        onChange={() => patch({ variant: 'grouped' })} />
                      זה לצד זה
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                      <input type="radio" name="variant" checked={draft.variant === 'stacked'}
                        onChange={() => patch({ variant: 'stacked' })} />
                      מוערם
                    </label>
                  </div>
                )}
              </div>
            )}
```

Add `groupBy` and `variant` to `emptyWidgetDraft()` in `widgetConfig.js` — find the `orConditions: [],` line added in Task 7 and add siblings:

```js
    conditions:   [],
    orConditions: [],
    groupBy:      { field: '', granularity: 'month' },
    variant:      'grouped',
```

Also add `groupBy: draft.groupBy` reset on entity change so a stale field from the previous entity doesn't leak through — in `handleEntityChange`, find the block from Task 7:

```jsx
      timePeriod:   { field: firstDate, operator: '', value: '' },
      conditions:   [],
      orConditions: [],
    })
```

replace with:

```jsx
      timePeriod:   { field: firstDate, operator: '', value: '' },
      conditions:   [],
      orConditions: [],
      groupBy:      { field: '', granularity: 'month' },
    })
```

Finally, the `onSave`/`previewWidget` calls already spread `...draft`, so `groupBy`/`variant` flow through automatically — no change needed there.

- [ ] **Step 7: Run the full frontend suite and build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: all pass, build succeeds.

- [ ] **Step 8: Manual verification**

Against the demo tenant (or wherever the dev server points), create a bar widget on leads grouped by `source` with a second grouping by `assigned_to`, save it, and confirm it renders as a multi-series (grouped) bar chart with a legend of agent names. Toggle "מוערם" in the modal on a new widget and confirm the preview switches to a stacked bar. Report what you saw.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/reports/AddWidgetModal.jsx frontend/src/pages/reports/WidgetCard.jsx frontend/src/lib/widgetConfig.js frontend/src/lib/widgetConfig.test.js
git commit -m "feat: second grouping dimension with stacked/grouped bar charts"
```

---

### Task 9: KPI target with progress bar

**Files:**
- Modify: `frontend/src/pages/reports/AddWidgetModal.jsx`
- Modify: `frontend/src/pages/reports/WidgetCard.jsx`
- Modify: `frontend/src/lib/widgetConfig.js`

**Interfaces:**
- Consumes: nothing new from backend (purely a frontend rendering feature — `target` never reaches the server, it's compared client-side against the already-fetched KPI value).
- Produces: `emptyWidgetDraft()` gains `target: null`. `KpiCard` renders a target line + progress bar when `widget.target` is a positive number.

- [ ] **Step 1: Add `target` to `emptyWidgetDraft()`**

In `frontend/src/lib/widgetConfig.js`, find the `variant: 'grouped',` line added in Task 8 and add a sibling:

```js
    variant:      'grouped',
    target:       null,
```

No test needed for this one-line default addition — it's covered by the existing `emptyWidgetDraft` "returns a fresh object each call" test already passing, and the rendering behavior below is exercised manually (KpiCard has no existing test file to extend, and adding a full React Testing Library setup for one component is out of scope for this plan — YAGNI, matches this file's existing lack of component tests entirely).

- [ ] **Step 2: Add the UI to `AddWidgetModal.jsx`**

Add a "יעד" input, shown for KPI widgets only, right after the "ערכים" block. Find:

```jsx
            {draft.type !== 'kpi' && (
              <div>
                <label className={LABEL_CLASS}>שדה להצגה</label>
```

add right before it:

```jsx
            {draft.type === 'kpi' && (
              <div>
                <label className={LABEL_CLASS}>יעד</label>
                <input type="number" value={draft.target ?? ''}
                  onChange={e => patch({ target: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="ללא יעד" className={SELECT_CLASS} dir="ltr" />
              </div>
            )}

            {draft.type !== 'kpi' && (
              <div>
                <label className={LABEL_CLASS}>שדה להצגה</label>
```

- [ ] **Step 3: Render the progress bar in `KpiCard`**

In `frontend/src/pages/reports/WidgetCard.jsx`, replace the `KpiCard` function:

```jsx
function KpiCard({ widget, onDelete, data, isLoading }) {
  const [hovered, setHovered] = useState(false)
  const value = typeof data === 'number' ? data : (data?.[0]?.total ?? '—')

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 flex-1 min-w-[140px] relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && onDelete && (
        <button
          onClick={onDelete}
          className="absolute top-2 left-2 text-gray-300 hover:text-red-400 text-sm leading-none"
          title="הסר widget"
        >
          ×
        </button>
      )}
      {isLoading ? (
        <Skeleton />
      ) : (
        <>
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{widget.title}</p>
          <p className="text-3xl font-bold tabular-nums" style={{ color: widget.color ?? '#2398c2' }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </>
      )}
    </div>
  )
}
```

with:

```jsx
function KpiCard({ widget, onDelete, data, isLoading }) {
  const [hovered, setHovered] = useState(false)
  const value  = typeof data === 'number' ? data : (data?.[0]?.total ?? '—')
  const target = widget.target
  const pct    = (typeof value === 'number' && target > 0) ? Math.min(100, (value / target) * 100) : null

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 flex-1 min-w-[140px] relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && onDelete && (
        <button
          onClick={onDelete}
          className="absolute top-2 left-2 text-gray-300 hover:text-red-400 text-sm leading-none"
          title="הסר widget"
        >
          ×
        </button>
      )}
      {isLoading ? (
        <Skeleton />
      ) : (
        <>
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{widget.title}</p>
          <p className="text-3xl font-bold tabular-nums" style={{ color: widget.color ?? '#2398c2' }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {pct !== null && (
            <>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">יעד: {target.toLocaleString()}</p>
              <div className="mt-1.5 h-1.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: widget.color ?? '#2398c2' }} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the full frontend suite and build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: all pass, build succeeds (no test file touches `KpiCard` directly, per Step 1's note — this step confirms nothing else broke).

- [ ] **Step 5: Manual verification**

Create a KPI widget with a target (e.g. total leads, target 100) and confirm the tile shows the value, "יעד: 100", and a progress bar filled proportionally. Report what you saw.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/reports/AddWidgetModal.jsx frontend/src/pages/reports/WidgetCard.jsx frontend/src/lib/widgetConfig.js
git commit -m "feat: KPI target with progress bar"
```

---

### Task 10: טבלת מדדים (metrics table) widget type

**Files:**
- Create: `frontend/src/pages/reports/MetricsTableWidget.jsx`
- Modify: `frontend/src/pages/reports/AddWidgetModal.jsx`
- Modify: `frontend/src/pages/reports/WidgetCard.jsx`
- Modify: `frontend/src/lib/widgetConfig.js`

**Interfaces:**
- Consumes: `dashboardApi.widgetData()` (existing, called once per tile).
- Produces: a `type: 'metrics_table'` widget whose config carries `tiles: [{ title, entity, valueField, aggregation, displayField, timePeriod, conditions }]` (each tile is a reduced single-KPI config, no `groupBy`/`orConditions`/`target` — those stay chart/KPI-only features). `<MetricsTableWidget tiles={[...]} />` fetches all tiles in parallel and renders a grid.

- [ ] **Step 1: Write the component**

No new pure-function test is warranted here — the component is a thin fetch-and-render wrapper with no branching logic worth unit-testing in isolation (consistent with this file's existing lack of component tests, same reasoning as Task 9's KpiCard). It's covered by the full frontend build + manual verification below.

Create `frontend/src/pages/reports/MetricsTableWidget.jsx`:

```jsx
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../api/dashboard'
import { widgetDataParams } from '../../lib/widgetConfig'

function MetricTile({ tile }) {
  const { data, isLoading } = useQuery({
    queryKey: ['metrics-tile', tile],
    queryFn:  () => dashboardApi.widgetData(widgetDataParams(tile)).then(r => r.data.data.total),
    staleTime: 60_000,
  })

  return (
    <div className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1 truncate">{tile.title}</p>
      <p className="text-xl font-bold tabular-nums text-gray-800 dark:text-gray-100">
        {isLoading ? '…' : (typeof data === 'number' ? data.toLocaleString() : '—')}
      </p>
    </div>
  )
}

export default function MetricsTableWidget({ tiles }) {
  if (!tiles?.length) {
    return <p className="text-sm text-gray-400 text-center py-8">אין מדדים בטבלה זו — ערוך את ה-widget כדי להוסיף</p>
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {tiles.map((tile, i) => <MetricTile key={i} tile={tile} />)}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `WidgetCard.jsx`**

In `frontend/src/pages/reports/WidgetCard.jsx`, add the import:

```jsx
import MetricsTableWidget from './MetricsTableWidget'
```

`metrics_table` widgets don't go through the single-widget `widgetData` fetch at all (each tile fetches independently) — they need to skip the `useQuery` entirely and render directly. In the main `WidgetCard` export, find the top of the function body:

```jsx
export default function WidgetCard({ widget, onDelete, onUpdate, dateParams, preview = false }) {
  const legacy = isLegacyWidget(widget)
```

replace with:

```jsx
export default function WidgetCard({ widget, onDelete, onUpdate, dateParams, preview = false }) {
  if (widget.type === 'metrics_table') {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 ${preview ? '' : 'lg:col-span-2'}`}>
        {!preview && <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{widget.title}</h3>}
        <MetricsTableWidget tiles={widget.tiles} />
      </div>
    )
  }

  const legacy = isLegacyWidget(widget)
```

- [ ] **Step 3: Add the widget type + tile editor to `AddWidgetModal.jsx`**

Find `CHART_TYPES` and add `metrics_table` as a 7th option:

```jsx
const CHART_TYPES = [
  { id: 'bar',   icon: '📊', label: 'עמודות אנכי'  },
  { id: 'bar_h', icon: '📉', label: 'עמודות אופקי' },
  { id: 'pie',   icon: '◉',  label: 'עוגה'          },
  { id: 'line',  icon: '📈', label: 'קו'             },
  { id: 'table', icon: '⊞',  label: 'טבלה'          },
  { id: 'kpi',   icon: '#',  label: 'מד'             },
  { id: 'metrics_table', icon: '▦', label: 'טבלת מדדים' },
]
```

For a `metrics_table` widget, the whole "one entity / one value / one filter set" form below the chart-type tabs doesn't apply — it needs its own tile-list editor instead. Wrap the existing form panel's contents in a conditional and add the tile editor as the alternate branch. Find the form panel's opening:

```jsx
          <div className="w-96 flex-shrink-0 border-l border-gray-100 dark:border-gray-700 p-6 overflow-y-auto space-y-5">

            <div>
              <label className={LABEL_CLASS}>סוג נתונים</label>
```

Wrap everything from that `<div>` (the whole form panel content, all the way to its closing `</div>` right before `{/* Preview */}`) in a ternary. Given the size of that block, the simplest correct edit is: keep the existing panel content exactly as-is but gate the whole thing behind `draft.type !== 'metrics_table' && (...)`, and add a sibling tile-editor block for the `metrics_table` case. Find the form panel's closing (right before the Preview comment):

```jsx
              <button type="button" onClick={addOrCondition} className="mt-1.5 text-xs text-[#2398c2] hover:underline">
                + הוסף סינון
              </button>
              </div>
            </div>
          </div>

          {/* Preview */}
```

replace with:

```jsx
              <button type="button" onClick={addOrCondition} className="mt-1.5 text-xs text-[#2398c2] hover:underline">
                + הוסף סינון
              </button>
              </div>
            </div>
          </div>

          {/* Preview */}
```

(no change here — this confirms the exact anchor). Instead, wrap starting from the opening `<div>` of the panel. Find:

```jsx
          <div className="w-96 flex-shrink-0 border-l border-gray-100 dark:border-gray-700 p-6 overflow-y-auto space-y-5">

            <div>
              <label className={LABEL_CLASS}>סוג נתונים</label>
```

replace just the opening tag and the wrapper, i.e. change:

```jsx
          <div className="w-96 flex-shrink-0 border-l border-gray-100 dark:border-gray-700 p-6 overflow-y-auto space-y-5">

            <div>
```

to:

```jsx
          <div className="w-96 flex-shrink-0 border-l border-gray-100 dark:border-gray-700 p-6 overflow-y-auto space-y-5">
          {draft.type === 'metrics_table' ? (
            <MetricsTileEditor tiles={draft.tiles ?? []} onChange={tiles => patch({ tiles })} entities={meta?.entities ?? []} fieldsByEntity={meta?.fields ?? {}} />
          ) : (
            <div>
```

and find the matching close (right before `{/* Preview */}`, already located above) and change the final two closing `</div>` tags of the panel:

```jsx
              </div>
            </div>
          </div>

          {/* Preview */}
```

to:

```jsx
              </div>
            </div>
          )}
          </div>

          {/* Preview */}
```

Now add the `MetricsTileEditor` component, placed above `export default function AddWidgetModal` (after `ConditionRow`):

```jsx
function MetricsTileEditor({ tiles, onChange, entities, fieldsByEntity }) {
  const addTile    = () => onChange([...tiles, { title: '', entity: entities[0]?.key ?? 'lead', valueField: '', aggregation: 'count', conditions: [] }])
  const removeTile = (i) => onChange(tiles.filter((_, idx) => idx !== i))
  const updateTile = (i, p) => onChange(tiles.map((t, idx) => idx === i ? { ...t, ...p } : t))

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">מדדים בטבלה</p>
      {tiles.map((tile, i) => (
        <div key={i} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <input type="text" value={tile.title} onChange={e => updateTile(i, { title: e.target.value })}
              placeholder="כותרת המדד..." className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
            <button type="button" onClick={() => removeTile(i)} className="text-gray-300 hover:text-red-500 flex-shrink-0 px-0.5">×</button>
          </div>
          <select value={tile.entity} onChange={e => updateTile(i, { entity: e.target.value })}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
            {entities.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </div>
      ))}
      <button type="button" onClick={addTile} className="text-xs text-[#2398c2] hover:underline">
        + הוסף מדד
      </button>
    </div>
  )
}
```

(`fieldsByEntity` is accepted but not yet used for a per-tile value-field picker — every tile counts records for its entity, matching the current session-wide reality that no entity has real numeric `valueFields` populated. This mirrors the same P1 decision already made for single KPI widgets, documented in the design spec as parked for when a numeric-field entity exists.)

Finally, `handleSave`'s validation currently requires `draft.title.trim()` for every widget type — a `metrics_table` widget's own title is still required (it's the board card's heading), so no change needed there. But `previewWidget` (used by `WidgetCard`'s `preview` mode) needs `tiles` to reach the preview render — it already spreads `...draft`, so `tiles` flows through automatically.

- [ ] **Step 4: Run the full frontend suite and build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: all pass, build succeeds.

- [ ] **Step 5: Manual verification**

Create a "טבלת מדדים" widget, add two or three tiles (different entities), save it, and confirm the board renders a grid of small tiles each showing a live count. Report what you saw.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/reports/MetricsTableWidget.jsx frontend/src/pages/reports/AddWidgetModal.jsx frontend/src/pages/reports/WidgetCard.jsx
git commit -m "feat: metrics table (טבלת מדדים) widget type"
```

---

### Task 11: Server-side board persistence — frontend migration

**Files:**
- Modify: `frontend/src/api/dashboard.js`
- Modify: `frontend/src/pages/reports/DashboardsPage.jsx`

**Interfaces:**
- Consumes: `/api/dashboards` CRUD endpoints (Task 5, already deployed backend-side).
- Produces: `dashboardApi.{listBoards, createBoard, updateBoard, deleteBoard, createWidget, updateWidget, deleteWidget}` in `dashboard.js`. `DashboardsPage` no longer reads/writes `localStorage` for its source of truth — on first mount it uploads any existing `crm_boards_v2` boards to the server (once) then always renders from the server.

- [ ] **Step 1: Add the API client methods**

In `frontend/src/api/dashboard.js`, add:

```js
  listBoards:   ()             => client.get('/dashboards'),
  createBoard:  (name)         => client.post('/dashboards', { name }),
  updateBoard:  (id, name)     => client.put(`/dashboards/${id}`, { name }),
  deleteBoard:  (id)           => client.delete(`/dashboards/${id}`),
  createWidget: (boardId, config) => client.post(`/dashboards/${boardId}/widgets`, { config }),
  updateWidget: (boardId, widgetId, config) => client.put(`/dashboards/${boardId}/widgets/${widgetId}`, { config }),
  deleteWidget: (boardId, widgetId) => client.delete(`/dashboards/${boardId}/widgets/${widgetId}`),
```

- [ ] **Step 2: Rewrite `DashboardsPage.jsx`'s data layer**

Read the full current file first (it changed across Tasks 6-10 — every `onSave`/`onDelete`/`onUpdate` call site added by those tasks must keep working, they only care about the callback *shape*, not where state lives). Replace the entire "── localStorage persistence ──" section and the component's board/widget CRUD functions.

Find (the whole localStorage section):

```jsx
// ── localStorage persistence ──────────────────────────────────────────────────

const STORAGE_KEY = 'crm_boards_v2'

function loadBoards() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // ignore
  }
  return DEFAULT_BOARDS
}

function saveBoards(boards) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards))
  } catch {
    // ignore
  }
}
```

replace with:

```jsx
// ── Server persistence, with a one-time localStorage upload ────────────────────

const STORAGE_KEY = 'crm_boards_v2'

// Normalizes a server board (widgets carry {id, config, position}) into the
// flat shape the rest of this file already works with ({id, name, widgets: [widgetConfig, ...]}),
// where each widget object keeps its server `id` merged into its own config.
function fromServerBoard(board) {
  return {
    id:   board.id,
    name: board.name,
    widgets: (board.widgets ?? []).map(w => ({ ...w.config, id: w.id })),
  }
}

async function migrateLocalStorageIfNeeded() {
  let localBoards = null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) localBoards = parsed
    }
  } catch {
    return
  }
  if (!localBoards) return

  const existing = await dashboardApi.listBoards()
  if (existing.data.data.length > 0) {
    // Server already has boards (e.g. migrated from another browser) — don't duplicate.
    localStorage.removeItem(STORAGE_KEY)
    return
  }

  for (const board of localBoards) {
    const created = await dashboardApi.createBoard(board.name)
    const boardId = created.data.data.id
    for (const widget of board.widgets ?? []) {
      const { id: _localId, ...config } = widget
      await dashboardApi.createWidget(boardId, config)
    }
  }
  localStorage.removeItem(STORAGE_KEY)
}
```

Now update the component itself. Find:

```jsx
export default function DashboardsPage() {
  const toast                       = useToast()
  const [boards, setBoards]         = useState(loadBoards)
  const [activeBoardId, setActive]  = useState(() => loadBoards()[0]?.id ?? 'default')
  const [showAddWidget, setShowAdd] = useState(false)

  const activeBoard = boards.find(b => b.id === activeBoardId) ?? boards[0]
  // No global range — all time by default; each widget carries its own filter.
  const dateParams  = {}

  // Persist on every change
  useEffect(() => {
    saveBoards(boards)
  }, [boards])
```

replace with:

```jsx
export default function DashboardsPage() {
  const toast                       = useToast()
  const [boards, setBoards]         = useState([])
  const [activeBoardId, setActive]  = useState(null)
  const [showAddWidget, setShowAdd] = useState(false)
  const [loaded, setLoaded]         = useState(false)

  const activeBoard = boards.find(b => b.id === activeBoardId) ?? boards[0]
  // No global range — all time by default; each widget carries its own filter.
  const dateParams  = {}

  async function refreshBoards(preferredActiveId) {
    const resp = await dashboardApi.listBoards()
    let serverBoards = resp.data.data.map(fromServerBoard)

    if (serverBoards.length === 0) {
      // Brand-new tenant/user with nothing migrated and nothing created yet — seed
      // the same starter board P1 used to ship via DEFAULT_BOARDS, but through the API.
      for (const seed of DEFAULT_BOARDS) {
        const created = await dashboardApi.createBoard(seed.name)
        const boardId = created.data.data.id
        for (const widget of seed.widgets) {
          const { id: _localId, ...config } = widget
          await dashboardApi.createWidget(boardId, config)
        }
      }
      const reseeded = await dashboardApi.listBoards()
      serverBoards = reseeded.data.data.map(fromServerBoard)
    }

    setBoards(serverBoards)
    setActive(preferredActiveId && serverBoards.some(b => b.id === preferredActiveId)
      ? preferredActiveId
      : serverBoards[0]?.id ?? null)
  }

  useEffect(() => {
    migrateLocalStorageIfNeeded()
      .catch(() => { /* migration is best-effort; a failed upload just leaves the old localStorage data in place for a retry next load */ })
      .finally(() => refreshBoards().finally(() => setLoaded(true)))
  }, [])
```

Now update the CRUD functions. Find:

```jsx
  function addBoard() {
    const newBoard = { id: makeId(), name: 'לוח בקרה חדש', widgets: [] }
    setBoards(prev => [...prev, newBoard])
    setActive(newBoard.id)
  }

  function renameBoard(id, name) {
    setBoards(prev => prev.map(b => b.id === id ? { ...b, name } : b))
  }

  function deleteBoard(id) {
    const board = boards.find(b => b.id === id)
    if (!board) return
    if (boards.length <= 1) { toast.error('חייב להישאר לפחות לוח אחד'); return }
    if (!confirm(`למחוק את הלוח "${board.name}"? הפעולה אינה הפיכה.`)) return
    setBoards(prev => {
      const next = prev.filter(b => b.id !== id)
      if (activeBoardId === id) setActive(next[0].id)
      return next
    })
  }

  function duplicateBoard(id) {
    const board = boards.find(b => b.id === id)
    if (!board) return
    const copy = {
      ...board,
      id: makeId(),
      name: `${board.name} (עותק)`,
      widgets: board.widgets.map(w => ({ ...w, id: makeId() })),
    }
    setBoards(prev => [...prev, copy])
    setActive(copy.id)
  }
```

replace with:

```jsx
  async function addBoard() {
    const created = await dashboardApi.createBoard('לוח בקרה חדש')
    await refreshBoards(created.data.data.id)
  }

  async function renameBoard(id, name) {
    await dashboardApi.updateBoard(id, name)
    await refreshBoards(activeBoardId)
  }

  async function deleteBoard(id) {
    const board = boards.find(b => b.id === id)
    if (!board) return
    if (boards.length <= 1) { toast.error('חייב להישאר לפחות לוח אחד'); return }
    if (!confirm(`למחוק את הלוח "${board.name}"? הפעולה אינה הפיכה.`)) return
    await dashboardApi.deleteBoard(id)
    await refreshBoards()
  }

  async function duplicateBoard(id) {
    const board = boards.find(b => b.id === id)
    if (!board) return
    const created = await dashboardApi.createBoard(`${board.name} (עותק)`)
    const boardId = created.data.data.id
    for (const widget of board.widgets) {
      const { id: _oldId, ...config } = widget
      await dashboardApi.createWidget(boardId, config)
    }
    await refreshBoards(boardId)
  }
```

Find:

```jsx
  function handleAddWidget(widgetConfig) {
    const widget = { ...widgetConfig, id: makeId() }
    setBoards(prev => prev.map(b =>
      b.id === activeBoardId
        ? { ...b, widgets: [...b.widgets, widget] }
        : b
    ))
    setShowAdd(false)
  }

  function handleDeleteWidget(widgetId) {
    setBoards(prev => prev.map(b =>
      b.id === activeBoardId
        ? { ...b, widgets: b.widgets.filter(w => w.id !== widgetId) }
        : b
    ))
  }

  function handleUpdateWidget(widgetId, patch) {
    setBoards(prev => prev.map(b =>
      b.id === activeBoardId
        ? { ...b, widgets: b.widgets.map(w => w.id === widgetId ? { ...w, ...patch } : w) }
        : b
    ))
  }
```

replace with:

```jsx
  async function handleAddWidget(widgetConfig) {
    await dashboardApi.createWidget(activeBoardId, widgetConfig)
    setShowAdd(false)
    await refreshBoards(activeBoardId)
  }

  async function handleDeleteWidget(widgetId) {
    await dashboardApi.deleteWidget(activeBoardId, widgetId)
    await refreshBoards(activeBoardId)
  }

  async function handleUpdateWidget(widgetId, patch) {
    const widget = activeBoard.widgets.find(w => w.id === widgetId)
    if (!widget) return
    const { id: _id, ...config } = { ...widget, ...patch }
    await dashboardApi.updateWidget(activeBoardId, widgetId, config)
    await refreshBoards(activeBoardId)
  }
```

Add a loading guard right before the final `return (` of the component — find:

```jsx
  // ── Render ──────────────────────────────────────────────────────────────────

  const kpiWidgets   = activeBoard?.widgets?.filter(w => w.type === 'kpi')  ?? []
  const chartWidgets = activeBoard?.widgets?.filter(w => w.type !== 'kpi')  ?? []

  return (
```

replace with:

```jsx
  // ── Render ──────────────────────────────────────────────────────────────────

  if (!loaded) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">טוען לוחות בקרה...</div>
  }

  const kpiWidgets   = activeBoard?.widgets?.filter(w => w.type === 'kpi' || w.type === 'metrics_table')  ?? []
  const chartWidgets = activeBoard?.widgets?.filter(w => w.type !== 'kpi' && w.type !== 'metrics_table')  ?? []

  return (
```

(`metrics_table` widgets render in the KPI row alongside single KPIs since `MetricsTableWidget` in Task 10 already renders itself as a `lg:col-span-2` card matching the chart grid's width even from inside the flex-wrap KPI row — verify this visually in Step 4 below; if it looks wrong in the KPI row, moving the `metrics_table` filter to `chartWidgets` instead is a one-line fix, use your judgment during manual verification.)

- [ ] **Step 3: Run the full frontend suite and build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: all pass (no test file directly covers `DashboardsPage.jsx` — same YAGNI reasoning as Tasks 9-10, this component has always been integration-tested manually, not unit-tested), build succeeds.

- [ ] **Step 4: Manual verification — this is the critical one**

1. In a browser with existing `localStorage['crm_boards_v2']` data (from before this plan), load the Dashboards page and confirm the old boards/widgets appear identically, then check `localStorage.getItem('crm_boards_v2')` in devtools returns `null` (migrated and cleared).
2. Reload the page again — confirm the same boards still appear (now served from the database, not re-migrated).
3. Add a board, add a widget, delete a widget, delete a board, rename a board — confirm each persists across a page reload.
4. Log in as a second user in the same tenant and confirm they see their own (different, or freshly-seeded default) boards, not the first user's.
5. Confirm the `metrics_table` and `kpi` widgets both render sensibly in whichever row they end up in (see the note in Step 2 above).

Report what you saw for all five checks before committing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/dashboard.js frontend/src/pages/reports/DashboardsPage.jsx
git commit -m "feat: server-side dashboard board persistence, replacing localStorage"
```

---

## Self-review notes (fixed inline while writing this plan)

- Confirmed `ConditionFilter::apply()`'s existing 6 callers (`LeadService`, `ContactController`, `ClientController`, `DashboardController`, `TaskController`, `RecordController`) all call it positionally without a 6th argument — Task 2's new `$boolean = 'and'` default is verified safe for all of them.
- Confirmed `WidgetDataService`'s `labelResolver()` is generic over any `groupMeta` shape (not hardcoded to `displayField`'s meta) — Task 3 reuses it unmodified for the second dimension rather than duplicating label logic.
- Confirmed no existing test in `WidgetDataServiceTest.php` asserts the exact literal return array (e.g. `assertSame(['rows' => ..., 'total' => ...], $result)`) — all existing tests destructure specific keys, so Task 1's added `resolvedRange` key and Task 3's conditional `seriesKeys` key cannot break any existing assertion.
- Task 6 (drill-down) intentionally has no backend task of its own — verified during exploration that every relevant list controller (`LeadController`, `ClientController`, `TaskController`, `ContactController`) already accepts a `conditions` query param end to end; `activity` has no such endpoint, handled by returning `null` from `drillDownEntityRoute` and rendering a message instead of a crash.
- Task 8 depends on Task 3's backend `seriesKeys` shape being live — since backend tasks (1-5) are ordered before frontend tasks (6-11) in this plan, that dependency is satisfied by task order, not by anything the implementer needs to reason about mid-task.
- Task 11 explicitly handles the case where `activeBoardId` might reference a board no longer present in a fresh `listBoards()` response (deleted, or migrated to a different server id) via the `preferredActiveId` fallback logic in `refreshBoards`.
