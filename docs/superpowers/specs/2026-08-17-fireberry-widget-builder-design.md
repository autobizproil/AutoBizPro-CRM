# Fireberry-Parity Widget Builder — Design Spec

Date: 2026-08-17
Status: draft for review
Reference: Fireberry screenshots captured from a live account (widget creation flow,
operator dropdowns, aggregation list, drill-down modal, entity list views).

## Goal

Rebuild the dashboard widget builder to match Fireberry's model closely enough that a
customer migrating from Fireberry feels at home. Three pillars (user-prioritized):

1. **Widgets over any entity** — not just leads.
2. **Smart filter values** — dropdowns/searchable lookups instead of free text.
3. **Drill-down** — clicking a chart segment opens the matching records list.

## Current state (what exists today)

- Widget builder over leads only, with fixed `dataSource` presets (leads_by_source,
  leads_by_agent, timeline, conversion, activities, 4 KPIs).
- Per-widget filters added 2026-08-17: period presets (today/7/30/90/365/custom) and
  condition rows (field/operator/free-text value) passed as `?conditions=JSON` to the
  lead-based report endpoints via `ConditionFilter`.
- Boards + widgets persist in `localStorage` (`crm_boards_v2`), not the DB.

## Fireberry's model (from screenshots)

Widget form fields, top to bottom:

| Field | Hebrew | Notes |
|---|---|---|
| Data type | סוג נתונים | entity picker — any record type incl. custom |
| Title | כותרת הגרף | free text |
| Values | ערכים | value field (entity-specific numeric/currency fields, or "מספר רשומות") + aggregation |
| Display field | שדה להצגה | group-by dimension (bar/pie/line/table only) |
| Grouping | קיבוץ נתונים | optional second dimension → multi-series; for date fields a granularity (יום/שבוע/חודש/שנה); stacked vs grouped variant toggle |
| Target | יעד | KPI only — numeric goal |
| Text color | צבע טקסט | KPI/chart accent |
| Time period | תקופת זמן | one date field + relative operator (list below) |
| Record filters | סינון רשומות | condition rows with smart values; "הוסף סינון"; "מתקדם..." |

Aggregations (ערכים second dropdown): סכום, ממוצע, מקסימום, מינימום, אחוז, סכום (אחוז).

Chart types: עמודות אנכי, עמודות אופקי, עוגה, קו, טבלה, מדד (KPI), טבלת מדדים.

Relative date operators (תקופת זמן / date-field conditions), full list from dropdown:
שווה ל, לא שווה ל, לפני תאריך, אחרי תאריך, היום, היום ואחרי, היום ולפני, לפני היום,
אחרי היום, עכשיו ואחרי, עכשיו ולפני, מחר, אתמול, מחרתיים, שבוע נוכחי, שבוע שעבר,
שבוע הבא, שבועיים קודמים, שבועיים הבאים, חודש נוכחי, חודש קודם, חודש הבא,
30/60/90 ימים אחרונים, 30/60/90 ימים הבאים, 2/3/12 חודשים קודמים, 2/3/12 חודשים הבאים,
רבעון נוכחי, רבעון קודם, רבעון הבא, רבעון 1/2/3/4 שנה נוכחית, שנה נוכחית, שנה קודמת,
שנה הבאה (tail of list assumed — verify).

Drill-down (from earlier screenshot "הכנסות לפי לקוח ושנים - א.פ שיפוצים - 2025"):
clicking a bar opens a modal titled "<widget> - <segment> - <series>" containing the
matching records table: checkbox column, entity columns, search box, pagination
(דף 1 מתוך N, סה"כ), column-settings gear, list/kanban toggle.

## Design

### 1. Widget config schema (frontend, per widget)

```js
{
  id, type,            // bar | bar_h | pie | line | table | kpi
  title, color,
  entity,              // 'lead' | 'client' | 'contact' | 'task' | 'activity'
  valueField,          // null = record count; else numeric field key
  aggregation,         // 'count' | 'sum' | 'avg' | 'max' | 'min' | 'percent'
  displayField,        // group-by key (charts/table)
  groupBy,             // optional second dimension { field, granularity? }
  variant,             // 'grouped' | 'stacked'
  target,              // KPI goal number | null
  timePeriod,          // { field, operator, value? } — relative ops resolved server-side
  conditions,          // [{ field, operator, value }]
}
```

Legacy widgets (`dataSource` presets) keep rendering through the existing fetchers —
no migration needed; new builder creates only the new shape.

### 2. Backend — one generic endpoint

`GET /api/dashboard/widget-data` with the widget config as query params (conditions
and timePeriod JSON-encoded). Per entity a server-side descriptor whitelists:

- queryable numeric value fields (e.g. lead: none yet → count only; task: none;
  future invoice entity: totals),
- group-by fields (+ join labels: assigned_to → users.name, pipeline_stage_id →
  stages.name/color),
- filterable fields (reuse the per-controller whitelists that already exist),
- date fields eligible for תקופת זמן (created_at, updated_at, due_at…).

Aggregation SQL is built from the descriptor only — no client-supplied column names
reach the query raw. Agent role scoping identical to today (ownedBy for leads, etc.).

A `RelativeDateRange` resolver maps every Hebrew operator above to [from, to] Carbon
pairs; tested in isolation with a frozen clock.

### 3. Field metadata endpoint

`GET /api/dashboard/widget-fields?entity=lead` returns the descriptor (fields, types,
labels, options) so the modal renders:

- enum fields (status, priority, source) → fixed dropdown,
- lookup fields (assigned_to → tenant users; pipeline_stage_id → stages) →
  searchable dropdown (like Fireberry's magnifier lookup),
- date fields → operator list above + date picker only for לפני/אחרי תאריך + שווה,
- text fields → free text as today.

Custom fields (cf_*) included from tenant field definitions where they exist.

### 4. Add/Edit Widget modal

Restructured to Fireberry's order: entity → title → values (field + aggregation) →
display field → grouping (+granularity, stacked/grouped) → target (KPI) → color →
time period → record filters. Editing an existing widget opens the same modal
pre-filled (today only date range is editable post-create — gap closed).

### 5. Drill-down

Click on bar/pie slice/line point/table row → modal:
title "<widget title> - <segment>[ - <series>]", fetches
`GET /api/<entity>s?conditions=...` (existing list endpoints) with the widget's
conditions + timePeriod + the clicked segment as an extra equals-condition.
Table shows the entity's default list columns, search box, pagination; CSV export
button reusing existing export where available. Assumed pie/line behave like bars
(open question #3).

### 6. KPI target

When `target` set: show value, target underneath ("יעד: X"), and a thin progress bar
value/target capped at 100%.

## Phases

- **P1** — descriptors + generic widget-data endpoint + RelativeDateRange + new modal
  (entity, values/aggregation, display field, smart filter values, time period).
- **P2** — drill-down modal; grouping second dimension + stacked/grouped; KPI target.
- **P3** — "מתקדם" (AND/OR groups — pending screenshot), טבלת מדדים widget type,
  board persistence server-side instead of localStorage.

## Open questions

1. "מתקדם..." contents — awaiting screenshot (assumed AND/OR condition groups).
2. טבלת מדדים — awaiting a live example (assumed: grid of KPI cells).
3. Pie/line drill-down — assumed same modal as bars.
4. Tail of the relative-date operator list beyond "רבעון 4 שנה נוכחית" — assumed
   שנה נוכחית/קודמת/הבאה.
