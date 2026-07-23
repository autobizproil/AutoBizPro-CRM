# HANDOFF — CRM (AutoBizPro) — 2026-07-05

## 1. Goal

Make the CRM maximally flexible and comfortable for users migrating from other systems (Fireberry) and for new users — everything editable:

- **Import**: CSV import must carry over status and creation date+time correctly. User's Fireberry export has Hebrew statuses ("לקוח פעיל", "בתהליך", "סגור - לא רלוונטי", "חדש") and dates like `02/07/2026 15:17`.
- **Record settings** (הגדרות רשומות): Settings screen managing fields per entity (leads/clients/contacts/tasks) — add/edit/delete/reorder/hide fields of any type (text, dropdown with custom options, date, checkbox...).
- **Inline editing**: every value in the leads table editable in place (hover pencil → input → Enter/blur saves), Hebrew/RTL correct.

User decisions (asked & answered):
- CSV statuses → **mapping step in import wizard** (map each CSV value to existing pipeline stage or create new).
- CSV created date → **overrides** system `created_at` (date+time in one datetime).
- Entities are **fixed** (leads/clients/contacts/tasks); no user-created record types.
- System fields: **rename label + hide + reorder only**; delete only for custom fields.

## 2. Current state

Everything below is **committed on `master` at `b89ceaae`** and was verified live in browser + DB:

- Settings → "הגדרות רשומות" tab works: entity sub-tabs, system fields auto-seeded per tenant (badge "מערכת"), inline rename, hide toggle (👁), ▲▼ reorder, custom field creation modal (10 types incl. select with options editor — one option per line), inline options editing, delete with confirm.
- Leads table inline editing works: name/phone/email + custom-field columns; select custom fields edit as dropdown; checkbox toggles instantly; verified `PUT /api/leads/{id} → 200` and MySQL persistence (incl. Hebrew).
- Import maps `created_at` ("נוצר בתאריך (תאריך + שעה)" in wizard) and parses 12 date formats; parser verified against the user's exact CSV values.
- Earlier session fixes (also in commit): X-Tenant localhost fix, roles_permissions table rename, all migrations reconciled (0 pending), failed_jobs table added, league/csv installed, ghost CustomFieldValidator call removed.
- DB has ~5,564 leads imported from user's real Fireberry CSV (import ran before status/date mapping existed — those leads have wrong created_at and no stage).

**Dev environment (must all be running):**
- MySQL: XAMPP — `C:\xampp\mysql_start.bat`
- Backend: `cd "D:\new auto\backend" && php artisan serve` (port 8000)
- Frontend: `cd "D:\new auto\frontend" && npm run dev` (port 5173, proxies /api + /sanctum)
- **Queue worker: `php artisan queue:work` — REQUIRED, imports hang forever without it**
- Login: `test@demo.local` / `password123`; tenant subdomain = `localhost` (tenant_id 1)

## 3. Active files

Backend:
- `backend/app/Http/Controllers/CustomFieldController.php` — entity-scoped field CRUD, SYSTEM_FIELDS constant per entity, seeding, reorder
- `backend/app/Models/CustomFieldDefinition.php` — fillable/casts for new schema
- `backend/app/Services/ImportService.php` — `importRow()`, `parseDate()` (created_at override lives here)
- `backend/app/Http/Controllers/ImportController.php` — mapping whitelist `['name','phone','email','source','notes','created_at']` (~line 60)
- `backend/app/Jobs/ProcessImportJob.php` — queue job looping CSV rows
- `backend/routes/api.php` — custom-fields routes ~line 208 (incl. POST /custom-fields/reorder)
- `backend/database/migrations/2026_07_05_000001_rebuild_custom_field_definitions_table.php` + matching `backend/SCHEMA_DB/*.sql`

Frontend:
- `frontend/src/api/customFields.js` — customFieldsApi (entity param), ENTITIES, FIELD_TYPE_LABELS, CREATABLE_TYPES
- `frontend/src/pages/settings/SettingsPage.jsx` — `LabelsTab` component (~line 770) = the record-settings UI; tab id 'labels', label 'הגדרות רשומות'
- `frontend/src/pages/leads/LeadsPage.jsx` — inline editing: `editCell`/`draft` state, `saveCell()`, `editInput()`, `pencilBtn()` (after `const col =` ~line 160); custom-field cells in tbody
- `frontend/src/pages/import/ImportPage.jsx` — wizard; `FIELDS` const at top (mapping targets)
- `frontend/src/api/client.js` — X-Tenant header logic (line ~17)

## 4. Changes made

(all in commit `b89ceaae`, 17 files, +552/−162)

1. `custom_field_definitions` table **rebuilt**: `entity, name, label, field_type, options(json), required, is_system, hidden, sort_order` + unique(tenant,entity,name). Old table (module/key/type/position from stale SCHEMA_DB script) was incompatible with all code.
2. CustomFieldController rewritten: entity validation, per-tenant system-field seeding (idempotent), system rows protected (label/hidden editable only, no delete), auto machine-name from label with Hebrew fallback (`cf_xxxxxx`), reorder endpoint.
3. SettingsPage `LabelsTab` rewritten (record-settings UI described above).
4. LeadsPage: new API shape (`(cfData ?? []).filter(f => !f.is_system && !f.hidden)`), inline-edit machinery for standard + custom fields (`field` = `'name'`/`'phone'`/`'email'` or `'cf:<name>'`).
5. ImportService: `parseDate()` + created_at override; ImportController whitelist + wizard FIELDS entry.
6. Fixes: X-Tenant `'demo'`→subdomain (client.js), removed ghost `CustomFieldValidator` call (LeadController update()), failed_jobs migration, roles_permissions rename.

## 5. Failed attempts

- **Don't trust pre-compaction summaries about this feature**: an earlier session's "completed" inline-editing implementation never existed on disk. Also a parallel half-design existed (module/key/type schema, `/settings/custom-fields` routes, `useCustomFields` hook) — dead code paths from it may still lurk. `backend/tests/Feature/CustomFieldControllerTest.php` **targets those nonexistent routes and will fail — needs rewrite** to match real API (`/api/custom-fields`, `entity`/`field_type` fields).
- Heredoc with large JSX through Bash broke (`unexpected EOF`) — for big string replacements write a .py file to scratchpad and run it.
- `migrate:refresh --force` and raw DDL via tinker get blocked by permission classifier — use proper Laravel migrations via `php artisan migrate --force` (allowed), and ask user before destructive DB ops.
- `php artisan tinker --execute` in PowerShell mangles `\$` escapes — run tinker one-liners through Bash (Git Bash) instead.
- Browser-tab renderer occasionally freezes on screenshot right after Vite hot-reload — wait a few seconds and retry.

## 6. Next steps

1. ~~Status-mapping step in import wizard~~ — done (§7).
2. ~~Backfill~~ — done twice (§8); leads carry real Fireberry dates + stages now.
3. **User's Fireberry-parity asks (from screenshots, 2026-07-05)** — the user wants migrating customers to "barely feel the switch":
   - **Create/delete record TYPES in settings** (not just edit fields of the 4 fixed entities) — user explicitly revisited the earlier "entities fixed" decision; wants e.g. חשבוניות מס, קבלות as record types. More screenshots promised.
   - **Filtering UI** like Fireberry's סינון panel (add conditions), incl. date-range filtering.
   - **User will send a Claude Design mockup** to drive a design pass — wait for it before big UI work.
4. **Phase 3**: render lead panel/create-modal/table headers from field definitions (respect label renames, hidden, sort_order) — system column labels still hardcoded in LeadsPage `ALL_COLS`.
5. Rewrite `CustomFieldControllerTest.php` for the real API.
6. Nice-to-have: per-user column widths.

## 7. Status-mapping step — done 2026-07-05 (uncommitted)

Wizard is now 5 steps: העלאה → מיפוי → **סטטוסים** → אישור → ייבוא.

Backend:
- Migration `2026_07_05_000002_add_status_mapping_to_import_jobs.php` (+ matching SCHEMA_DB sql) adds `status_mapping` JSON column to `import_jobs`. **Ran already** (`php artisan migrate --force`).
- `ImportJob` model: added `status_mapping` to `$fillable`/`$casts` — **caught a bug here during testing**: without this the column silently stayed null and no leads got a stage. Always add new columns to both fillable and casts, verify with a real write+refetch, not just "migration ran".
- `ImportController`: `start()` now accepts `status_mapping`, allows `status` in the field-mapping whitelist; new `distinctValues()` action (route `POST /api/import/distinct-values`, body `{import_id, column}`) scans the whole CSV for unique values of a column — powers the wizard step.
- `ImportService`: `distinctValues($path, $column)`; `importRow()` takes a 3rd `$statusMap` param (`csvValue => pipelineStageId`) and sets `pipeline_stage_id` (never writes raw status text to the leads table).
- `ProcessImportJob`: before the row loop, resolves `status_mapping` once — `{create: "label"}` entries become `PipelineStage::firstOrCreate` (new position appended), plain IDs pass through — then passes the resolved map into every `importRow()` call.

Frontend (`ImportPage.jsx`):
- `FIELDS`/`AUTO` gained a `status` entry (autodetects "סטטוס/status/שלב/stage/מצב").
- New step 3: table of distinct CSV status values, each with a select (existing pipeline stages from `usePipeline()`, "+ צור שלב חדש", or skip) + a text input for the new-stage label when creating. Defaults: exact case-insensitive name match → existing stage, else create-new pre-filled with the CSV value.
- `useDistinctValues()` hook added in `useImport.js`; `importApi.distinctValues()` added in `api/import.js`.
- Step 2 "המשך" now calls the distinct-values endpoint (if a status column is mapped) before advancing; skips straight to preview if not mapped.

**Verification**: browser upload wasn't possible this session (file_upload tool blocks paths outside shared folders — scratchpad isn't shared). Instead verified the full backend path via `php artisan tinker`: created an `ImportJob` row with a real 3-row Hebrew CSV, ran `ProcessImportJob::handle()` directly, confirmed all 3 leads landed with correct `pipeline_stage_id` (1 matched-existing, 2 newly-created stages) and correct `created_at` override. Also unit-checked `distinctValues()` against the same file. Test rows/stages were cleaned up after. Frontend: `npx vite build` passes; wizard step logic and API wiring reviewed but **not click-tested in a real browser** — do that before considering this fully done (upload a small CSV through the actual UI, confirm the new step 3 renders and round-trips).

Not yet done: `.claude/launch.json` was created this session (frontend config only, port 5173) to support browser automation — harmless, can stay or be removed.

## 8. Same-day round 2 — fixes after user testing (2026-07-05, uncommitted)

User tested with the real 5,732-row Fireberry CSV. Issues found and fixed:

1. **Stale queue worker** — the running `php artisan queue:work` predated the status-mapping code, so the user's first real import got no stages and today's created_at. **PHP queue workers must be restarted after every backend deploy/edit** — worker killed & restarted (`nohup php artisan queue:work --tries=3 > storage/logs/queue.log &`). Also `ImportJob` model was missing `status_mapping` in fillable/casts (fixed in §7 notes).
2. **Backfill** — user re-imported after מחק הכל rather than waiting; ran a matching backfill (scratchpad script via tinker, match by name+normalized phone) that restored `pipeline_stage_id` and real `created_at` for ~5,598 leads. Verified against Fireberry screenshot (יהודה וייס → 01/08/2025 11:29 exact match). 7 leads (dup-phone rows) still have import-day dates.
3. **created_at auto-detect miss** — wizard auto-map compared header 'נוצר בתאריך' against the long label; added proper `AUTO.created_at` synonyms in ImportPage.jsx.
4. **Custom fields importable** — CSV columns can now map to custom lead fields (עיר, כמות דלתות): ImportController start() whitelist extends with tenant's non-system `CustomFieldDefinition` names; ImportService.importRow() routes non-reserved mapping keys into `custom_fields` JSON; ImportPage builds mapping rows from `customFieldsApi.list('leads')`. E2E-verified through real HTTP (in-page fetch upload → distinct-values → start → leads had cf JSON + stages).
5. **Leads table pagination** — page state + הקודם/הבא buttons + "עמוד X מתוך Y"; page resets on search/filter/view change. (User couldn't scroll past first 25 before.)
6. **Column sorting** — click any header (incl. custom-field columns) toggles asc/desc with ▲▼ indicators, Fireberry-style. Backend: `sort_by`/`sort_dir` in LeadController→LeadService with column whitelist + `JSON_EXTRACT` ordering for `cf_*` names.
7. **Date column display** — now shows time + date (dd.mm.yyyy hh:mm) like Fireberry, not date-only.
8. **Settings drag-and-drop reorder** — replaced ▲▼ buttons with HTML5 drag (⠿ handle, row dims while dragging); verified in browser.

All verified live in Chrome against the real 5,563-lead dataset. **Remember: restart the queue worker after backend changes.**

## 9. State snapshot — 2026-07-13

- Branch `master`, last commit `6bb3d392` (webhook coverage gap, global agent-ability tiers, real queueing). Before it: master-plan roadmap docs, project CLAUDE.md (schema law + git discipline), agent API tokens + signed outgoing webhooks, AutomationTest fixes + retroactive SCHEMA_DB mirror.
- **Work queue = 5 uncommitted PLAN-*.md at repo root** (2026-07-12): automation-engine-depth, field-driven-lead-ui (= Phase 3 from §6), records-module-parity, scheduler-time-triggers, webhook-delivery-log-kill-switch. Ranking not recorded in the files — confirm order with user before starting.
- §6 "Next steps" partially superseded: Phase 3 → PLAN-field-driven-lead-ui; record-types ask → PLAN-records-module-parity.

## 10. Workflow change — 2026-07-13 (permanent)

- 4 unused `tasky-*` custom agents + `honest-advisor`/`security-sweep` project skills archived to `~/.claude/archive/` (zero invocations in 30 days). Restore = move back.
- File-based workflow: reference paths, no giant chat pastes. Respond to user in Hebrew.
