# PLAN — Custom Records Module: Fireberry Parity (+ two real bugs)

## Goal

Custom record types (חשבוניות מס, קבלות…) exist end-to-end but the records screen is a skeleton next to the leads screen: no pagination controls, no column sorting, no multi-condition filtering, no inline editing, and whole-JSON search that matches field NAMES as well as values. The user's stated bar is "migrating customers barely feel the switch" — records must feel like the leads table. Also fixes two genuine bugs found during exploration (required-checkbox unsatisfiable; missing tenant_id on create path needs verification).

## Current reality (verified 2026-07-12)

- `backend/app/Http/Controllers/RecordController.php`:
  - `index()` — `search` does `where('data', 'like', "%…%")` over the raw JSON text (matches keys, quotes, numbers-as-strings); fixed `paginate(25)`; `orderByDesc('id')` only.
  - `store()` (line 44-51) — required check uses `empty($data['data'][$name])`: **a required checkbox set to `false` and a required number set to `0` can NEVER pass** — `empty(false)===true`, `empty(0)===true`, `empty('0')===true`.
  - `store()` (line 53) — `Record::create([...])` does **not** set `tenant_id`, though `records.tenant_id` is `NOT NULL` in SCHEMA_DB. Either the `Record` model has a tenant global scope auto-filling on create, or every create fails/succeeds only via DB default. **First implementation step: read `backend/app/Models/Record.php` and verify. If tenant_id is not auto-filled, this is a P0 bug — creating a record would throw on MySQL strict mode.**
  - `update()` — `array_merge(old, new)`: keys never deleted; clearing a field client-side sends `''` which persists. OK, but means "unset" is impossible — acceptable.
- `frontend/src/pages/records/RecordsPage.jsx` (219 lines) — search box + table + create/edit modal. No pagination UI (only first 25 reachable — the exact bug users hit on leads in HANDOFF §8.5), no sort, no filters, no inline edit.
- Reference implementations to mirror (do NOT invent new patterns):
  - Sorting: `backend/app/Services/LeadService.php:50-61` (whitelist + JSON path) and LeadsPage `toggleSort`/`sortableTh` (LeadsPage.jsx:206-229).
  - Conditions: `LeadService::applyConditions` (LeadService.php:73-106) + `frontend/src/pages/leads/FilterPanel.jsx` (125 lines).
  - Pagination UI: LeadsPage הקודם/הבא block (grep `עמוד` in LeadsPage.jsx).
  - Inline edit: LeadsPage `editCell`/`draft`/`saveCell` machinery (~line 160 area per HANDOFF §3).
- Field defs for a record type come from `customFieldsApi.list(slug)` — entity = the record-type slug (`CustomFieldController::entityOr404` accepts custom slugs; no system fields seeded for them, all defs are custom).

## Files to touch

1. `backend/app/Http/Controllers/RecordController.php` — search/sort/conditions/pagination params + bug fixes
2. `backend/app/Models/Record.php` — verify tenant scope (fix if needed)
3. `frontend/src/pages/records/RecordsPage.jsx` — pagination, sorting, inline edit, filter panel reuse
4. `frontend/src/api/recordTypes.js` — pass new query params
5. `backend/tests/Feature/RecordControllerTest.php` — NEW (none exists today)
6. NO schema changes expected (unless Record tenant bug requires none anyway — it's code-level)

## Implementation order

### Step 1 — Verify/fix the two bugs (before features)

a) Read `Record.php`. If no tenant auto-fill: add `tenant_id => app('current_tenant_id')` to the `Record::create` array in `store()`. Write a test that creates a record via API and asserts `tenant_id` equals the authenticated tenant.

b) Required-field check: replace `empty(...)` with type-aware presence:

```php
$val = $data['data'][$name] ?? null;
$missing = $def->field_type === 'checkbox'
    ? false                                   // a checkbox always has a value; required is a UI concept only
    : ($val === null || $val === '');
```

(`0`, `false`, `'0'` are legitimate values.) Apply the same rule in `update()`? — update currently has NO required validation at all; leave that as-is (partial updates by design), note in a comment.

### Step 2 — Backend list(): search, sort, conditions

Rework `index()`:

- **Search**: instead of LIKE over raw JSON, iterate the type's field defs and OR per-field: `->where(function($q) use ($fields,$search){ foreach ($fields as $name => $def) $q->orWhere("data->{$name}", 'like', "%{$search}%"); })`. Laravel's `data->name` arrow syntax compiles to `JSON_EXTRACT` on MySQL and `json_extract` on sqlite — **use it instead of raw `JSON_UNQUOTE(JSON_EXTRACT(...))` so the feature tests (sqlite :memory:) actually exercise the same code path**. Guard: only defs whose `name` matches `/^[a-z0-9_]+$/` (they all should — machine names are generated that way) to prevent JSON-path injection.
- **Sort**: `sort_by` must be one of the type's field names (validate against `fieldDefs`) or `created_at`/`id`. Field sort: `->orderBy("data->{$name}", $dir)`. `sort_dir` sanitized exactly like LeadService.php:53.
- **Conditions**: accept `conditions` JSON (same shape as leads: `{field, operator, value}`), operators reused from `LeadService::FILTER_OPERATORS`. Extract `applyConditions` into a shared helper? NO — copy the ~30 lines into RecordController with the `data->` arrow-syntax columns; a shared abstraction across two different storage layouts (columns+JSON vs pure JSON) buys complexity, not reuse. Keep diffs small.

### Step 3 — Frontend: pagination + sorting

- Add `page` state; pass `{ search, page, sort_by, sort_dir }` through `recordsApi.list`; render the same הקודם/הבא + "עמוד X מתוך Y" block as LeadsPage; reset page on search/filter change (`useEffect` mirror of LeadsPage.jsx:153).
- Sortable `<th>`: copy `sortableTh` helper; field key = def `name`, plus the נוצר column sorting by `created_at`.

### Step 4 — Frontend: filter panel

Reuse `FilterPanel.jsx` if its props are generic (read it first — it takes fields+conditions callbacks per commit bae8bfed). Fields = the type's defs (`{key: f.name, label: f.label}`). Serialize conditions into the list query exactly like LeadsPage.jsx:112 (`JSON.stringify` when non-empty).

### Step 5 — Frontend: inline editing

Copy the LeadsPage pencil/edit-cell pattern: cell click → input matching `field_type` (select → dropdown from `options`, checkbox → instant toggle mutation, date/datetime → native input) → Enter/blur saves via `recordsApi.update(type.id, r.id, { data: { [name]: value } })` (backend merge semantics make single-key updates safe). Keep the row-click-opens-edit-modal behavior but `e.stopPropagation()` on inline-edit cells (same trick as the delete button at RecordsPage.jsx:161).

### Step 6 — Tests (`RecordControllerTest.php`)

Setup mirrors other feature tests (tenant + user + sanctum; see `TenantIsolationTest` for the pattern). Cover: tenant isolation on all 5 routes (recordType of tenant B → 403), required checkbox=false passes, required text='' fails 422, `0` passes for required number, search matches value not field-name (create field `city`, record with value `haifa`, search `city` → 0 results, search `haifa` → 1), sort asc/desc on a data field, conditions equals/contains/empty, pagination page 2.

## Edge cases a weaker model would miss

1. **`empty()` semantics** (Step 1b) — the canonical PHP footgun; visible only when someone makes a checkbox or numeric field required.
2. **Search matching JSON keys**: `where('data','like','%city%')` returns every record of a type that HAS a `city` field. The per-field JSON approach in Step 2 is the fix; a test must encode it.
3. **sqlite vs MySQL JSON**: raw `JSON_UNQUOTE(JSON_EXTRACT(...))` (the LeadService pattern) breaks on sqlite (`JSON_UNQUOTE` doesn't exist) — LeadService escapes this only because no feature test sorts leads by cf. For records, use Laravel `data->name` arrow syntax so sqlite tests are honest.
4. **Numeric comparison inside JSON**: `data->{amount} > 100` compares as strings on MySQL unless cast. For MVP document that gt/lt on JSON fields is lexicographic for non-numeric storage; if the executor wants correctness: `CAST(JSON_UNQUOTE(...) AS DECIMAL)` MySQL-only — skip, note in comment.
5. **`update()` merge means inline checkbox toggle must send the boolean, not undefined** — `{data: {done: false}}` merges correctly; omitting the key silently keeps old value.
6. **Record model global scope** (Step 1a) — if a tenant scope exists, `index()`'s explicit `where('record_type_id', ...)` plus scope is fine; if NOT, then `show/update/destroy` route-model-binding `Record $record` resolves ACROSS tenants and only the `record_type_id === recordType->id` + recordType tenant check saves you — which happens to be safe, but only accidentally. Verify and add the scope if missing (mirror `Lead` model's scope).
7. **Deleting a record type cascades all its records** (FK `ON DELETE CASCADE` in SCHEMA_DB) — the Settings delete-type confirm should state the record count. Optional polish; skip if `RecordTypeController::destroy` already guards.

## Acceptance criteria

1. In browser: a record type with 30+ records shows pagination; page 2 reachable; search by a value in any field finds the record; search by a field's NAME finds nothing.
2. Click a column header → server-side sort flips (verify via network request params, not just visual order).
3. Filter panel: condition `city equals חיפה` narrows results; clearing restores.
4. Inline edit a select field → dropdown, save persists after hard reload.
5. Required checkbox field: record with unchecked box saves successfully (bug fix proven).
6. `php artisan test` — 142 existing + new RecordControllerTest all pass.
