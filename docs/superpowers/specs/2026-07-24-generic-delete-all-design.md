# Generic "Delete All" bulk action — design

## Goal

A single "Delete All" capability that works for every list entity in the CRM — the four
hardcoded ones (leads, contacts, clients, tasks) and every tenant-defined custom record
type (`record_types`/`records`) — instead of one-off, per-entity implementations.

## Background / prior art

Leads already has this feature, built earlier the same day this design was written:

- Route: `DELETE /api/leads/all/clear` → `LeadController::deleteAll`
  (`backend/app/Http/Controllers/LeadController.php:39`)
- Confirmation: `frontend/src/pages/leads/LeadsPage.jsx:269-273` uses a native
  `window.prompt()` requiring the user to type the Hebrew word "מחק", button in the page
  header (`LeadsPage.jsx:605-609`).
- The delete is a soft delete (`Lead::query()->delete()`), tenant-scoped automatically by
  the model's global tenant scope, with an explicit `RolePermission::allows(...)` check
  inside the controller in addition to the route's `permission:leads,can_delete`
  middleware (belt-and-suspenders for a destructive tenant-wide action).

No other entity has this today. Custom record types have no delete-all path at all.

## Existing permission conventions (must be preserved, not redesigned)

Permission checks for entities other than leads/contacts already piggyback on the
`leads` permission bucket — this is existing, intentional behavior in
`backend/routes/api.php`, not something this feature changes:

| Entity | Single-delete route permission |
|---|---|
| leads | `leads,can_delete` |
| contacts | `contacts,can_delete` |
| clients | `leads,can_delete` |
| tasks | `leads,can_update` (not `can_delete` — existing quirk, preserved as-is) |
| record-type records | `leads,can_delete` |

The new delete-all endpoint mirrors this table exactly per entity, so permission
behavior for existing users doesn't change.

## Backend design

**One new route:** `DELETE /api/entities/{entity}/all`

`{entity}` is either one of the four hardcoded keys or a `record_types.slug` value
(`rt_xxxxxx`). A single path avoids a combinatorial explosion of per-entity routes and
matches the requirement of "one generic endpoint."

**One new controller:** `BulkDeleteController::destroyAll(Request $request, string $entity)`

- No static route permission middleware (the permission module/action depends on which
  entity string is resolved, which isn't known at route-registration time). Instead the
  controller performs the permission check explicitly, exactly like the existing
  `LeadController::deleteAll` already does — this is a continuation of an established
  pattern in this codebase, not a new one.
- Resolution order:
  1. If `$entity` is one of `leads|contacts|clients|tasks`: look up the matching Eloquent
     model class and permission pair from a small static map, run the permission check,
     `Model::count()` then `Model::query()->delete()`, tenant scoping is automatic via
     each model's `HasTenantScope`.
  2. Otherwise: look up `RecordType::where('tenant_id', app('current_tenant_id'))
     ->where('slug', $entity)->first()`. 404 if not found (covers typos and
     cross-tenant slug guesses — `RecordType` is tenant-scoped so a slug belonging to
     another tenant simply won't be found). Run the `leads,can_delete` check, then
     `Record::where('record_type_id', $recordType->id)->count()` /
     `->delete()`.
- Response: `{success: true, data: {deleted: <count>}}` — same shape as the existing
  `LeadController::deleteAll`.
- Soft delete throughout (`SoftDeletes` is already on all five affected models) — this
  is not a hard/permanent delete, consistent with every other delete path in the app.

**Removed:** `LeadController::deleteAll` and the `DELETE /api/leads/all/clear` route —
leads moves onto the generic endpoint so there is exactly one code path for this feature,
per the requirement that this be a single generic implementation. The frontend's
`useDeleteAllLeads` hook and its direct API call are removed and replaced by the new
shared hook (below).

## Frontend design

**New shared modal:** `DeleteAllModal` (location: `frontend/src/components/ui/`, next to
other shared UI components like `Layout.jsx`).

Props: `entityLabel` (Hebrew display name for the confirmation copy), `total` (current
count, shown in the warning), `open`, `onClose`, `onConfirm` (async).

Behavior:
- Real modal (not `window.prompt`), so it works consistently across the pages and isn't
  blocked/styled oddly by the browser like a native prompt.
- Warning copy states the action is irreversible and how many records will be deleted.
- A text input must contain exactly "מחק" before the confirm button enables — matches
  the existing leads convention's wording, just moved from `window.prompt` into a real
  modal.
- Confirm button shows a loading state while the request is in flight and disables
  itself to prevent double-submit.

**New shared hook:** `useDeleteAllEntity(entity)` in `frontend/src/hooks/` (or colocated
with existing per-entity hooks — exact file TBD at implementation time, not a design
decision) — wraps `DELETE /api/entities/{entity}/all`, invalidates that entity's list
query key on success so the table refreshes to empty.

**Placement:** the trigger button sits near the pagination controls at the bottom of each
table (not the page header, where the current leads button lives) — this is an explicit,
deliberate change from the existing leads placement, requested directly rather than
inferred.

**Wired into:** `LeadsPage.jsx` (replacing its existing prompt-based delete-all),
`ContactsPage.jsx`, `ClientsPage.jsx`, `TasksPage.jsx`, and `RecordsPage.jsx` (the last
one is generic over `record_type.slug`, so it automatically covers every custom record
type without per-type frontend code).

## Out of scope

- Changing the `tasks` single-delete permission quirk (`can_update` instead of
  `can_delete`) — not something this feature is meant to fix, and changing it would be
  an unrelated behavior change riding along with this feature.
- Hard/permanent delete — everything here is soft delete, matching every other delete
  path in the app today.
- Undo/restore UI for the soft-deleted records — out of scope; existing soft-deleted
  records elsewhere in the app have no restore UI either, this doesn't introduce a new
  gap.
