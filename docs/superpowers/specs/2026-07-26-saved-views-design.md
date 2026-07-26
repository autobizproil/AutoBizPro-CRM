# Saved Views (Contacts/Clients/Leads/Tasks/Records) — design

## Goal

Let a user save a named combination of advanced filter + search + column
order/visibility per entity ("לידים חדשים, 20 ימים אחרונים"), select it from a
list, mark one as default per entity so it auto-applies on page load, and
persist all of this server-side (per-user, not localStorage) so it survives
across browsers/devices and reloads until manually changed.

Builds directly on the generic advanced filter system shipped in
`docs/superpowers/specs/2026-07-26-generic-advanced-filters-design.md` — that
spec explicitly scoped saved views out as "the next sub-project."

## Scope

A saved view captures three things together, as one unit:
- The advanced filter (`dateFrom`, `dateTo`, `conditions` — same shape
  `FilterPanel.jsx` already emits and `ConditionFilter::apply` already
  consumes)
- The free-text search box value
- Column visibility — **correction after re-checking the code**:
  `crm_leads_cols` (`LeadsPage.jsx:247`) is a visibility dict
  (`{colKey: boolean}`, `visibleCols` state), not a reorderable array —
  column *order* comes from `CustomFieldDefinition.sort_order`, a
  tenant-wide Settings setting, not something a saved view controls. No
  other page (Contacts/Clients/Tasks/Records) has any column
  show/hide feature at all today. So: `visible_columns` is a nullable JSON
  dict, meaningful only for Leads right now; the other four entities' saved
  views simply never populate it (`SavedViewsBar` still works for them,
  just without a columns component to capture).

Personal only — views belong to the user who created them, not shared
tenant-wide. Applies to all five entities: Leads, Contacts, Clients, Tasks,
Records (including every custom record type, scoped per record-type slug).

## Data model

New migration in `SCHEMA_DB/`, table `saved_views`:

| column | type | notes |
|---|---|---|
| `id` | bigint pk | |
| `tenant_id` | bigint | existing tenant-scoping pattern, FK |
| `user_id` | bigint | FK `users`, owner — personal views only |
| `entity_type` | string | `leads`\|`contacts`\|`clients`\|`tasks`\|`records` |
| `entity_key` | string, nullable | record-type slug; set only when `entity_type = records`, since each custom record type has its own field set |
| `name` | string | user-supplied |
| `search` | string, nullable | free-text search box value |
| `date_from` | date, nullable | |
| `date_to` | date, nullable | |
| `conditions` | json, nullable | `[{field, operator, value}, ...]` |
| `visible_columns` | json, nullable | `{colKey: boolean}`, Leads-only for now (see Scope) |
| `is_default` | boolean, default false | at most one true per `(tenant_id, user_id, entity_type, entity_key)` |
| timestamps | | |

Default-uniqueness is enforced at the application layer inside a DB
transaction (unset any prior default for that `(entity_type, entity_key)`
scope, then set the new one) rather than a partial unique index, matching
existing precedent in this codebase for "only one active X" — confirm the
actual precedent (e.g. how a default/primary flag is handled elsewhere) while
implementing, and mirror it rather than inventing a new pattern.

## Backend API

New `SavedViewController` + `SavedView` model. Routes in the same
auth/tenant-scoped middleware group as the existing entity controllers:

```
GET    /api/saved-views?entity_type=leads&entity_key=
POST   /api/saved-views              {entity_type, entity_key?, name, search, date_from, date_to, conditions, visible_columns}
PUT    /api/saved-views/{id}         same body, used both for rename and "update view" (overwrite with current page state)
DELETE /api/saved-views/{id}
POST   /api/saved-views/{id}/set-default
```

- Ownership check on update/delete/set-default:
  `abort_unless($view->user_id === $request->user()->id, 403)` — same
  `$request->user()` pattern already used throughout (e.g.
  `TaskController::store/update`), not `auth()->id()`. No admin override —
  personal feature.
- Also scoped to tenant like every other resource:
  `abort_unless($view->tenant_id === app('current_tenant_id'), 403)`.
- `entity_type` validated against the fixed whitelist above.
- `entity_key` required only when `entity_type = records`, and must resolve
  to a record type the current tenant actually owns.
- `conditions` validated with the same field/operator/value shape the
  existing per-entity filter request validation already uses.
- List endpoint scopes to `user_id = $request->user()->id` — a user only
  ever sees their own views.
- **No changes to the five existing list endpoints**
  (`LeadController::index`, `ContactController::index`, etc.). Saved views
  only supply values for their existing `date_from`/`date_to`/`conditions`/
  `search` query params; the frontend does the wiring, backend list endpoints
  are untouched.

## Frontend

- `frontend/src/lib/savedViews.js` — API client (`list/create/update/
  remove/setDefault`), same shape as existing `api/*.js` per-domain files.
- `frontend/src/components/ui/SavedViewsBar.jsx` — one generic component
  shared across all five pages (same pattern as `FilterPanel.jsx` and
  `NavEditModal.jsx` — reusable, no page-specific logic inside it):
  - Dropdown listing saved views for the current entity, "All" (no filter)
    always first and implicit.
  - "Save current as new view" → small modal, name input.
  - When a saved view is active: shows its name, a dirty-state indicator if
    current filter/search/columns diverge from what's stored, "Update view"
    button (overwrites the stored view with current state), and a kebab menu
    for rename/delete/set-default.
  - Props: `entityType`, `entityKey` (records slug, else undefined),
    `currentState={search, dateFrom, dateTo, conditions, visibleColumns}`
    (`visibleColumns` only ever populated on Leads today; other four pages
    pass `undefined`), `onApply(view)`.
- `frontend/src/lib/useSavedViews.js` — hook: fetches views for
  `(entityType, entityKey)`, tracks `activeViewId`, computes the dirty flag by
  comparing `currentState` to the active view's stored values, exposes
  `applyDefaultOnMount` (if a default view exists, its state is applied to
  page state before the first list fetch fires).
- **Per-page wiring**, same shape on all five pages (`LeadsPage.jsx`,
  `ContactsPage.jsx`, `ClientsPage.jsx`, `TasksPage.jsx`,
  `RecordsPage.jsx`): mount `useSavedViews`, apply the default view (if any)
  on mount before the first fetch, render `<SavedViewsBar>` next to the
  existing filter-toggle/search box, wire `onApply` into the same state
  setters `FilterPanel`'s `onApply` already uses.

## Behavior: editing an active saved view

Per confirmed direction: manually changing filter/search/columns while a
saved view is active does **not** silently mutate the stored view. The view
stays exactly as saved; the UI shows a "changed, not saved" state. The user
explicitly chooses "Update view" (overwrite) or "Save as new" to persist the
change. Just switching pages or reloading without saving discards the
in-progress change and reverts to the stored view's state next time it's
loaded.

## Error handling & edge cases

- Deleting the currently-active view: page falls back to "All" (no filter),
  no crash.
- Deleting the default view: default is simply gone for that entity scope;
  next load shows "All" until a new default is picked.
- Records `entity_key` pointing at a since-deleted record type: the view is
  silently excluded from the list for that slug (no crash, no cascade-delete
  needed — record-type deletion is rare and out of scope here).
- Two tabs calling set-default concurrently: last write wins inside the
  transaction; DB never ends up with two `is_default = true` rows for the
  same scope.
- `conditions`/`visible_columns` referencing a field removed from
  `CustomFieldDefinition` since the view was saved: `FilterPanel`/
  `ConditionFilter` already no-op on unknown fields today — same tolerance
  applies unchanged when the values come from a saved view instead of live
  UI state.

## Testing

- Backend `SavedViewTest.php`: CRUD, cross-user ownership denial, the
  set-default transaction (second call to a different view unsets the
  first), `entity_key` required only for `records`, list scoped to the
  requesting user only.
- Frontend: `useSavedViews`/dirty-state comparison unit test, same pattern as
  the existing `navLayout.test.js`.
- No new browser e2e coverage planned beyond manual verification — flag in
  HANDOFF if this ships without a live click-test, same caveat already
  standing for nav customization.

## Out of scope

- Sharing views across a tenant/team — personal-only per confirmed decision.
- Any change to the five existing list endpoints' filtering logic itself —
  this feature only feeds their existing inputs.
- Adding a `custom_fields`/filterable-field column to `Task` — the
  pre-existing gap noted in the advanced-filters spec is unchanged here.
