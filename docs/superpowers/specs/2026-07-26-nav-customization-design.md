# Customizable top navigation — design

## Goal

Let each user reorder the top navigation bar's items and choose which ones show
directly versus collapse into the "עוד" (More) dropdown — replacing the current
hardcoded `PRIMARY_NAV`/`MORE_NAV` split in `frontend/src/components/ui/Layout.jsx`.

## Background / prior art

`Layout.jsx:12-27` currently defines two fixed arrays:

- `PRIMARY_NAV` — Leads, Clients, Contacts, Tasks (with a badge), Reports — always
  visible in the main bar.
- `MORE_NAV` — Dashboard, Pipeline, Automations, Forms, Landing Pages — always inside
  the "עוד" dropdown.

Custom record types (`Layout.jsx:60-65`) are fetched separately and always rendered in
their own "רשומות מותאמות" section inside the More dropdown (`Layout.jsx:138-151`) —
never reorderable, never eligible to move into the main bar.

None of this is user-configurable today. This feature makes the whole thing
draggable and persists the result.

There is already a working precedent for exactly this kind of setting in this
codebase: Leads' column reorder/show-hide, persisted to `localStorage` under
`crm_leads_cols` with a version tag (`LeadsPage.jsx:76-83`) so a future shape change
falls back to defaults instead of crashing on stale saved data. This feature follows
that same pattern for the nav bar.

## Scope

Per-user (per-browser), not per-tenant — confirmed directly, not inferred. `localStorage`
only; no cross-device sync, no backend storage. If the user clears their browser data
or switches devices, the nav resets to the default order — acceptable, matching how
column preferences already behave today.

## Data model

One JSON blob in `localStorage` under `crm_nav_layout`, versioned the same way as
`crm_leads_cols`:

```json
{
  "_v": "v1",
  "items": [
    { "key": "leads", "pinned": true, "position": 0 },
    { "key": "clients", "pinned": true, "position": 1 },
    { "key": "rt_25aif6", "pinned": false, "position": 6 }
  ]
}
```

- `key` — a stable identifier: the existing hardcoded nav entries keep their current
  `to` path as their key (e.g. `"leads"`, `"dashboard"`); custom record types use
  their `RecordType.slug` (e.g. `"rt_25aif6"`) so the saved layout survives a record
  type's label being renamed later.
- `pinned` — `true` = shows directly in the main bar, `false` = lives in the "עוד"
  dropdown.
- `position` — sort order within whichever group (`pinned: true` items sort among
  themselves; `pinned: false` items sort among themselves) — not a single global
  ordinal, so pinning/unpinning an item doesn't require renumbering the whole list.

The full list of nav items available to reorder is the union of:
1. Today's `PRIMARY_NAV` + `MORE_NAV` entries (their `to`/`labelKey`/`badge` stay
   defined in code as before — only their pinned/position values move into
   `localStorage`)
2. Every custom record type from `recordTypesApi.list()` (already fetched in
   `Layout.jsx:60-63`), now treated as first-class nav items instead of being
   hardcoded into their own always-in-More section.

If `localStorage` has no saved layout yet, or the saved version tag doesn't match, or a
saved `key` no longer corresponds to a known nav item (e.g. a deleted custom record
type) or a *new* nav item exists that isn't in the saved layout yet (e.g. a newly
created custom record type, or a future code-added page): fall back to today's
hardcoded grouping/order for anything unresolved, so nothing silently disappears from
the nav and nothing crashes on stale data.

## UI

A small "ערוך תפריט" (edit menu) button/icon in the header (next to the existing
"עוד" dropdown trigger) opens a modal:

- Two columns or two labeled sections: "בסרגל הראשי" (in the main bar) and "בתפריט עוד"
  (in the More menu), each listing its items in current order.
- Each row has a drag handle — reuses the same native HTML5 drag/drop already
  implemented for Leads' column reorder (`LeadsPage.jsx`, the existing `עמודות`
  dropdown), not a new drag library.
- Dragging an item between the two sections toggles its `pinned` value; dragging
  within a section reorders it.
- Closing the modal (save) writes the new `localStorage` blob and the header
  re-renders from it immediately — no page reload needed.
- A "reset to default" action clears the `localStorage` key and reverts to the
  hardcoded default grouping/order.

Badge counts (currently only the Tasks item's task-count badge) stay attached to
whichever group the item currently sits in — if a user drags Tasks into "עוד", the
badge simply doesn't render there, matching how `MORE_NAV` items never showed a badge
before. Not building badge support inside the More dropdown as part of this feature.

## Out of scope

- Per-tenant defaults or admin-managed nav layouts — per-user/localStorage only, per
  the confirmed scope.
- Cross-device sync — explicitly not required.
- Reordering *within* the "רשומות מותאמות" section only (the old, narrower ask) — this
  feature replaces that section entirely with full participation in the same unified
  reorder/pin system as every other nav item.
- Any change to which routes exist or what each page does — this only changes how they're
  surfaced in the top nav.
