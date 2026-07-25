# Generic advanced filter system (Contacts/Clients/Tasks/Records) — design

## Goal

Give Contacts, Clients, Tasks, and every custom record type the same advanced
filtering (date range + multi-condition field filters) that Leads already has —
without duplicating Leads' filter logic per entity.

## Background / prior art

Leads already has a full advanced filter system:

- **Frontend:** `frontend/src/pages/leads/FilterPanel.jsx` — a pure, generic
  component. It takes `fields` (array of `{key, label}`) and `conditions` as props
  and emits `onApply({dateFrom, dateTo, conditions})`. Nothing in this component is
  leads-specific — it doesn't need to change at all for this feature.
- **Backend:** `backend/app/Services/LeadService.php:71-104`, `applyConditions()`.
  Each condition is `{field, operator, value}`; `field` is either a whitelisted system
  column or `cf_<name>` targeting the `custom_fields` JSON column via
  `JSON_UNQUOTE(JSON_EXTRACT(...))`. Operators: equals, not_equals, contains, gt, gte,
  lt, lte, empty, not_empty. Date range (`date_from`/`date_to`) is applied separately
  against `created_at` (`LeadService.php:39-44`).
- **Field list:** `frontend/src/pages/leads/LeadsPage.jsx:260-267` derives
  `FILTER_FIELDS` from that tenant's `CustomFieldDefinition` rows for the `leads`
  entity (falling back to a hardcoded list if none are loaded yet).

Contacts, Clients, Tasks, and the generic Records page currently have only a plain
text `search` box — no date range, no field conditions.

## What's genuinely reusable vs what's new

- `FilterPanel.jsx` — reused as-is, zero changes.
- `LeadService::applyConditions`'s logic — extracted into a shared service, not
  rewritten per entity.
- Everything else (wiring each page's own filter button, state, and field list) is
  new, following the exact pattern Leads already established.

## Backend design

**New shared service:** `backend/app/Services/ConditionFilter.php`

```php
ConditionFilter::apply(
    $query,              // Eloquent query builder
    array $conditions,   // [{field, operator, value}, ...] from the request
    array $systemFields, // whitelisted direct-column field names for this entity
    ?string $jsonColumn, // e.g. 'custom_fields', or null if every field is a direct column
    bool $allFieldsAreJson = false // true only for Records, where every field lives in $jsonColumn
): void
```

Extracted directly from `LeadService::applyConditions`, generalized only in:
- which column name JSON fields live under (`custom_fields` for Leads/Contacts/
  Clients, `data` for Records)
- whether a field is JSON-based via a `cf_` prefix convention (Leads/Contacts/
  Clients) or via `$allFieldsAreJson` with no prefix (Records, since every field of
  a custom record type lives in `data` with no system/custom split)
- the whitelist of direct system-column field names, passed in per entity instead of
  hardcoded

`LeadService::applyConditions` is replaced with a call to this shared service (Leads
keeps its exact current behavior — this is a refactor of leads' own code path, not
just an addition for the other four).

**Per-entity wiring**, mirroring how Leads' `index()` already accepts filters:

| Entity | Controller | System fields whitelist | JSON column |
|---|---|---|---|
| Contacts | `ContactController::index` | `name, phone, email, company, role, created_at` | `custom_fields` |
| Clients | `ClientController::index` | `name, phone, email, company, source, assigned_to, created_at` | `custom_fields` |
| Tasks | `TaskController::index` | `title, priority, status, due_at, assigned_to, created_at` | none (Task has no `custom_fields` column — a pre-existing gap this feature doesn't fix; conditions on Tasks are system-fields-only) |
| Records | `RecordController::index` | none (every field is JSON) | `data`, `$allFieldsAreJson = true` |

Each controller's `index()` accepts `conditions` (JSON-encoded query param, same as
`LeadController::index` already does — see `date_from`/`date_to`/`conditions`
handling in that controller), decodes it, and passes it plus `date_from`/`date_to`
straight into `ConditionFilter::apply`.

## Frontend design

For each of the four pages (`ContactsPage.jsx`, `ClientsPage.jsx`, `TasksPage.jsx`,
`RecordsPage.jsx`):

- A `FILTER_FIELDS` list derived from that entity's `CustomFieldDefinition` rows,
  exactly like `LeadsPage.jsx:260-267` — for Records this is just `fields` (already
  fetched in that page today), for the other three it's a new
  `useQuery(['custom-fields', entity])` call (same hook Leads already uses) plus a
  small hardcoded list of that entity's own system fields for the fallback case, in
  the same shape Leads' `FALLBACK_FILTER_FIELDS` already provides.
- `advFilter` state (`{dateFrom, dateTo, conditions}`), a filter-toggle button next
  to the existing search box, and `<FilterPanel fields={FILTER_FIELDS}
  conditions={advFilter.conditions} onApply={...} onClose={...} />` — identical
  wiring to `LeadsPage.jsx`'s existing usage, just parameterized per page.
- The page's list query gains `date_from`/`date_to`/`conditions` params alongside its
  existing `search` param.

No new frontend component is created — `FilterPanel` is shared across all five
pages (Leads + these four) as a single component.

## Out of scope

- Adding a `custom_fields` column to `Task` — the Tasks filter will simply not
  support `cf_`-style custom-field conditions, matching current reality. Flagging
  this as a real, separate, pre-existing gap (custom fields for tasks have nowhere
  to be stored at all) rather than silently working around it.
- Saved views / persistent active filter — that's the next sub-project, built on top
  of this one, not part of this spec.
- Any change to Leads' own filtering behavior beyond the internal refactor that
  moves its condition logic into the shared service (its behavior stays identical).
