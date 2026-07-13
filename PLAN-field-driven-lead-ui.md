# PLAN — Field-Definition-Driven Lead UI (HANDOFF "Phase 3")

## Goal

Make the leads UI (table columns, filter panel, create modal, lead panel) render from `custom_field_definitions` instead of hardcoded constants, so that when a user renames a system field label, hides it, or reorders it in Settings → הגדרות רשומות, the leads screen actually reflects it. **Today the record-settings screen half-lies to the user: renaming/hiding/reordering system fields saves to DB but changes nothing on the leads page.**

## Current reality (verified 2026-07-12)

- `frontend/src/pages/leads/LeadsPage.jsx:26` — `ALL_COLS` hardcodes the 7 system columns with Hebrew labels.
- `LeadsPage.jsx:130` — `customFieldDefs = (cfData ?? []).filter(f => !f.is_system && !f.hidden)` — **system definitions are fetched and then thrown away**. Only custom fields become dynamic columns.
- `LeadsPage.jsx:164` — `FILTER_FIELDS` hardcodes labels again for the filter panel.
- `LeadsPage.jsx:24` — `EMPTY_FORM` + the create-lead modal hardcode name/phone/email/source/stage/notes inputs.
- `frontend/src/pages/leads/LeadPanel.jsx` — detail panel hardcodes standard field rows.
- Backend truth: `backend/app/Http/Controllers/CustomFieldController.php:17` `SYSTEM_FIELDS['leads']` seeds 8 defs: `name, phone, email, source, pipeline_stage_id, assigned_to, notes, created_at`. System rows allow editing `label`, `hidden`, `sort_order` only (no delete). Seeding is lazy — happens on first `GET /api/custom-fields?entity=leads` per tenant.
- Backend sorting whitelist: `backend/app/Services/LeadService.php:51` — raw column names (`pipeline_stage_id`, not `stage`).

## Files to touch

1. `frontend/src/pages/leads/LeadsPage.jsx` (main work)
2. `frontend/src/pages/leads/LeadPanel.jsx`
3. `frontend/src/pages/leads/FilterPanel.jsx` (receives field list as prop — verify current prop shape before editing)
4. NO backend changes required (API already returns everything needed).

## Implementation order

### Step 1 — Build a single "effective columns" derivation in LeadsPage

Replace the `ALL_COLS` + `customFieldDefs` merge (lines 26–34 and 130–136) with one derivation from `cfData`:

```js
// def.name → existing UI column key + renderer identity
const SYSTEM_COL_KEY = {
  name: 'name', phone: 'phone', email: 'email', source: 'source',
  pipeline_stage_id: 'stage', assigned_to: 'assigned_to', created_at: 'created_at',
  // 'notes' — see edge cases: NOT a table column, panel/modal only
}
const defs = (cfData ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
const dynamicCols = defs
  .filter(f => !f.hidden && f.name !== 'notes')
  .map(f => f.is_system
    ? { key: SYSTEM_COL_KEY[f.name], label: f.label, always: f.name === 'name' }
    : { key: `cf_${f.name}`, label: f.label, cfName: f.name, always: false })
```

Fallback: if `cfData` is empty/undefined (first load before lazy seeding, or fetch error), fall back to the old hardcoded `ALL_COLS` array — keep it as `FALLBACK_COLS`. Never render a zero-column table.

### Step 2 — Fix everything that assumed static column keys

- `DEFAULT_VISIBLE` (line 36): derive as `Object.fromEntries(dynamicCols.map(c => [c.key, true]))` instead of a static object.
- Bump `COLS_VERSION` `'v3'` → `'v4'` (line 43) — the saved localStorage shape changes meaning (hidden defs no longer appear at all).
- Column-visibility dropdown: iterate `dynamicCols`, not `ALL_COLS`.
- Sorting: the `stage` column must call `toggleSort('pipeline_stage_id')` — backend whitelist at `LeadService.php:51` has no `stage` entry. Map `col.key === 'stage' ? 'pipeline_stage_id' : col.key` when calling `toggleSort`, and compare `sortBy` against the mapped value for the ▲▼ indicators.

### Step 3 — FILTER_FIELDS from defs

Replace the hardcoded array at line 164 with a map over `defs` (`f.hidden` excluded; system → plain key, custom → `cf_${name}`). Keep `status` and `pipeline_stage_id` semantics as-is (backend `FILTERABLE_FIELDS` at `LeadService.php:15` is the whitelist — do not send keys it will silently drop; `notes` is NOT in it, so exclude notes from filter fields too).

### Step 4 — Create modal from defs

Render inputs by iterating `defs` where `!f.hidden`: system defs map to the existing `form` keys (`pipeline_stage_id` renders the stage `<select>` from `stages`, `assigned_to` may be omitted from create — match current behavior: current modal has no assigned_to input, keep it that way by skipping `assigned_to` in the modal), custom defs write into a `custom_fields` object included in the create payload (verify `LeadController::store` accepts `custom_fields` — inline editing already PUTs them, but **check store() validation allows it; if not, add it to the validated fields in `backend/app/Http/Controllers/LeadController.php` store()**). Use `f.label` for the input label and `f.required` for the `required` attribute.

### Step 5 — LeadPanel from defs

LeadPanel already fetches defs (`LeadPanel.jsx:43`) but with `customFieldsApi.list()` — **no entity param**, which defaults to `leads` server-side but bump it to `customFieldsApi.list('leads')` and queryKey `['custom-fields', 'leads']` so it shares the cache with LeadsPage (different queryKeys today: `['custom-fields']` vs `['custom-fields', 'leads']` — that's a live cache-miss bug). Render the detail rows sorted by `sort_order`, labels from defs, hidden fields omitted.

### Step 6 — Kanban tab

LeadsPage has an inline Kanban (לוח tab, commit f7cc946c). Grep the Kanban card rendering inside LeadsPage.jsx for hardcoded labels ('טלפון' etc.) and swap to the def labels via a `labelOf(name)` helper.

## Edge cases a weaker model would miss

1. **Lazy seeding race**: system defs exist only after the first `GET /custom-fields?entity=leads` for the tenant. A brand-new tenant that opens Leads before Settings will trigger the seed via LeadsPage's own fetch — fine — but the response of THAT first call already includes the seeded rows (seeding happens server-side before responding, `CustomFieldController::index` calls `seedSystemFields` first). So no special handling needed beyond the empty-array fallback.
2. **`name` must stay always-visible**: current `always: true` prevents hiding via the columns dropdown. If a user hides the `name` system def in Settings, the table would lose its anchor column and row-click. Rule: `name` ignores `hidden` in the leads table (still respect its label rename). Document this in a code comment.
3. **`notes` def exists but was never a table column**: keep it out of the table and filter panel (`FILTERABLE_FIELDS` excludes it), but DO render it in the create modal and LeadPanel.
4. **`stage` sort key mismatch** (Step 2) — sending `sort_by=stage` silently falls into the `latest()` fallback branch at LeadService.php:60. No error, wrong order. Test explicitly.
5. **localStorage migration**: old `crm_leads_cols` blobs keyed v3 must be discarded (the `_v` check at line 47 handles it once you bump the version — do not skip the bump).
6. **Two different custom-field queryKeys** (`['custom-fields']` in LeadPanel vs `['custom-fields','leads']` in LeadsPage) cause double fetches and stale-after-settings-change behavior. Unify to `['custom-fields', 'leads']`. SettingsPage invalidates `['custom-fields']` prefix on save — verify with grep that its invalidateQueries uses a prefix that also matches the entity-scoped key (react-query prefix matching covers `['custom-fields','leads']` when invalidating `['custom-fields']`).
7. **RTL truncation**: long renamed labels in `<th>` — existing `whitespace-nowrap` handles it; don't add width constraints.

## Acceptance criteria (verify each in browser, dev env per HANDOFF §2)

1. Settings → הגדרות רשומות → rename phone label of leads to `נייד` → Leads table header, filter-field dropdown, create modal label, and LeadPanel row all show `נייד` after one refetch (no hard reload needed if invalidation works).
2. Hide `source` → column disappears from table AND columns-dropdown AND filter panel AND create modal; existing lead data untouched.
3. Drag-reorder fields in Settings → leads table column order matches new `sort_order` (left/right per RTL).
4. Click the status column header → rows sort by stage; network tab shows `sort_by=pipeline_stage_id`.
5. Hiding `name` in settings does NOT remove the name column (rename still applies).
6. Create a lead through the modal with a required custom field empty → browser blocks submit (HTML required); fill it → lead created, custom value visible in its column.
7. `npx vite build` passes; `php artisan test` still 142 passed (no backend change should break anything).
