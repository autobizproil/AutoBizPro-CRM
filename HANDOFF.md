# HANDOFF — CRM (AutoBizPro) — 2026-07-24 (updated, same day)

## 1. Goal

Two pieces of work landed this session, on top of the prior same-day session (generic CSV import, dark-mode header fix — see §9 below for that context, preserved from before):

1. **Users + Permissions Settings tabs** (planned feature, via superpowers subagent-driven-development): the two "בקרוב" (coming soon) placeholders in Settings — "משתמשים" and "הרשאות" — are now fully working, wired to pre-existing backend endpoints that were built but never given a UI.
2. **Automations bug-fix pass** (user report mid-session: "automations don't really work"): live-testing found the app's one existing automation had never fired, ever (zero log rows despite being active). Root-caused and fixed multiple structural gaps — this wasn't a UI problem, the whole trigger-firing mechanism had holes.

Along the way, a **third-party automated tool ("aider", running gemini-2.5-flash, committing directly to this branch concurrently)** introduced two real regressions that were found and fixed as part of this session's verification work — see §5.

## 2. Current state

All committed on branch `nightly/20260724-030003` (note: this environment auto-rotates to a new `nightly/YYYYMMDD-030003` branch daily at 03:00 — this branch was `nightly/20260715-030003` until the session's Task 6, when the rotation happened mid-work; nothing was lost, the new branch carries the same commit graph forward).

Dev stack running: MySQL/XAMPP, `php artisan serve` (:8000), `npm run dev` (:5173), `php artisan queue:work`. Login: `test@demo.local` / `password123`, tenant subdomain `localhost`. Backend: 142/142 tests passing. Frontend: `npx vite build` clean.

### Users + Permissions Settings tabs — DONE, reviewed, verified live

- **UsersTab** (`frontend/src/pages/settings/SettingsPage.jsx`): user list (name/email/role/status), create-user modal, inline role-change `<select>` (admin-only, can't edit own role), status toggle (deactivate/reactivate — deactivate correctly gated on `can_delete`, reactivate on `can_update`, since they hit different backend endpoints/permissions).
- **PermissionsTab**: full role×module×action matrix (3 roles × 6 modules × 4 actions), seeded from backend defaults where no tenant override exists, editable, admin-only save (matches backend's hard `abort_unless(role==='admin')` gate on `PUT /settings/permissions` — not just a `can()` check).
- New: `frontend/src/api/users.js`, two methods added to `frontend/src/api/settings.js`.
- Verified live end-to-end as both admin and a real manager-role login: create/edit/deactivate/reactivate users, save+reload-persists on permissions, and confirmed a non-admin sees no create/edit/save affordances anywhere in Settings.
- Full spec/plan/review trail: `docs/superpowers/specs/2026-07-24-users-permissions-settings-design.md`, `docs/superpowers/plans/2026-07-24-users-permissions-settings.md`, ledger at `.superpowers/sdd/progress.md` (gitignored, local only).
- Commits: `ca80eb28` → `a2ba821f` (6 tasks) → final-review fixes `d0eaf2f0`, `0408e14d`, `cc2431c4`.

### Automations — root cause found and fixed, verified live

**The symptom:** the one automation configured in this tenant (trigger `lead_status_changed`, condition `status = "נסגר בהצלחה"`, action `convert_to_client`) had **zero `AutomationLog` rows, ever**, despite being active.

**Root causes found (all confirmed by reading code + querying the DB, not guessed):**

1. **`Lead.status` is fully dead.** Nothing in the app sets it to anything meaningful — `pipeline_stage_id` replaced it long ago (`LeadsPage.jsx` already has a comment calling it "legacy status"). Every lead in the DB had `status = NEW_LEAD`, always. The automation's trigger (`lead_status_changed`) and condition (`status = "..."`) could never match anything.
2. **Automation firing for Lead events only happened in `LeadService`'s manual `fire()` calls** — so any path that creates/updates a Lead *without* going through `LeadService` (WhatsApp inbound webhook, Voicenter/Paycall call webhooks, Facebook Lead Ads, CSV import) silently never fired `lead_created`/`lead_stage_changed` automations. **Fix:** moved firing into `LeadObserver` (`backend/app/Observers/LeadObserver.php`), which already exists specifically to solve this exact "bypasses LeadService" problem for the outgoing webhook (Make/n8n) system — it just was never extended to internal automations. Now every Eloquent-persisted Lead change fires correctly, from any entry point.
3. **`call_received`/`whatsapp_received` trigger types were offered in the automation-builder UI and accepted by backend validation, but nothing anywhere ever called `fire()` for them.** Wired into `VoicenterService::processWebhook` and `IntegrationsController::whatsappWebhook`.
4. **The `send_email` action completely ignored the automation's configured subject/body**, always sending a generic field dump instead. Fixed in `NotificationService::sendEmail`.
5. **`scheduled` trigger removed from the UI** — zero scheduler infrastructure exists anywhere in this Laravel app (no `Console\Kernel` schedule, no cron command). It was pure vaporware, actively misleading. Not built this session (would need real design: what "scheduled" means, a migration for schedule config, a recurring command) — flagged as a real follow-up if wanted, not started.
6. **`lead_status_changed` trigger + `status` condition field removed from the UI entirely** and replaced with a real `pipeline_stage_id` condition (stage-name dropdown, mirrors the existing `change_stage` action's stage picker). The one broken automation's DB row was migrated (pure tenant data, not schema) from the dead status-based config to `trigger_type=lead_stage_changed`, `conditions=[{field:pipeline_stage_id, operator:'=', value:5}]` (stage 5 = "נסגר בהצלחה", confirmed by name match).

**Verified live, end-to-end, in the browser:** moved a real lead to pipeline stage "נסגר בהצלחה" via the Leads page's inline stage selector → `AutomationLog` row created (`status=success`) → a `Client` record was created from that lead (the `convert_to_client` action). This automation has never worked before this session.

**Known, deliberately not fixed this session (spawned as background tasks for later):**
- Bulk lead actions (`LeadService::bulk()`, `change_stage` branch) use a query-builder mass `UPDATE`, which bypasses Eloquent model events entirely — so bulk stage-changes from the Leads page's multi-select still won't fire `lead_stage_changed` automations. Only single-lead changes fire correctly.
- The backend's global `ValidationException` handler (`backend/bootstrap/app.php:29-36`) always sets a generic top-level error message on every 422 response everywhere in the app, which masks field-specific messages (e.g. the duplicate-email error on user creation shows a generic "שגיאת ולידציה" instead of the real message) — pre-existing, unrelated to automations specifically, but found while testing the new Users tab.
- **New re-entrancy consideration introduced by fix #2 above** (documented in code, not guarded): an automation's own `change_stage` action now re-enters `LeadObserver` and can fire another `lead_stage_changed` automation. Latent — same-value stage updates fire nothing (Eloquent dirty-check), and no automation currently uses `change_stage` as an action — but a chain of stage-changing automations could cascade. See the comment in `LeadObserver.php` if this becomes a live concern.

Commits: `dd6841e8` (backend firing fixes), `1456fba2` (frontend dead-option cleanup + real stage condition), `cc2431c4` (review follow-ups: re-entrancy doc, dead `lead_status_changed` fully removed).

## 3. Third-party regressions found and fixed (not our work, but landed on this branch)

An automated tool called **"aider" (co-authored commits, model `gemini/gemini-2.5-flash`)** made two commits directly to this branch mid-session (`de1258bf`, `34ab3d28`, both "RTL/LTR fixes" across ~10 frontend files) — some other process running concurrently against the same repo, not something either of us triggered in this conversation. It introduced two real, severe bugs:

1. **Duplicate `usePreferences` import in `SettingsPage.jsx`** → broke the entire Vite build. Fixed: `c0b1cf67`.
2. **`GeneralTab` and `ContactsPage` both call `tr(...)`/`usePreferences()` without importing them** → both pages **crashed to a blank white screen on every single load**, for every user, no error boundary. `GeneralTab` is the default Settings tab, so this broke Settings entirely. Found while manually testing Settings as a non-admin user; fixed: `d0eaf2f0` (GeneralTab), `0408e14d` (ContactsPage, found by the final whole-branch code review — same bug, different file, the first fix commit didn't cover it).

**Worth knowing:** other files aider touched (`Layout.jsx`, `FormsPage.jsx`, `RecordsPage.jsx`, `LeadPanel.jsx`, `FilterPanel.jsx`, `ClientsPage.jsx`, `TasksPage.jsx`, `LandingPageEditor.jsx`) were checked for the same missing-import pattern and are clean — only `GeneralTab` and `ContactsPage` had it. Not otherwise reviewed line-by-line for other issues aider might have introduced.

## 4. Active files

Backend: `backend/app/Observers/LeadObserver.php`, `backend/app/Services/LeadService.php`, `backend/app/Services/Integrations/VoicenterService.php`, `backend/app/Http/Controllers/IntegrationsController.php`, `backend/app/Services/NotificationService.php`, `backend/app/Http/Requests/StoreAutomationRequest.php`, `backend/app/Http/Controllers/UserController.php` (pre-existing, unmodified — the UsersTab consumes this), `backend/app/Http/Controllers/SettingsController.php` (pre-existing, unmodified — `getPermissions`/`updatePermissions`).

Frontend: `frontend/src/pages/settings/SettingsPage.jsx` (UsersTab, CreateUserModal, PermissionsTab all live here, inline — matches the file's existing convention of one file per Settings tab-set), `frontend/src/api/users.js` (new), `frontend/src/api/settings.js`, `frontend/src/pages/automations/AutomationsPage.jsx`, `frontend/src/pages/contacts/ContactsPage.jsx` (aider-crash fix only).

## 5. Next steps

1. Nothing blocking — both pieces of work this session are done, tested, and live-verified.
2. Two background-task suggestions were spawned (chips shown to user, not yet started):
   - Fix the global validation-message handler masking field-specific 422 errors app-wide (`backend/bootstrap/app.php`).
   - Fix bulk lead stage-change bypassing automation firing (`LeadService::bulk()`).
3. Real, larger feature if wanted later: a `scheduled` automation trigger — needs actual design (what does "scheduled" mean — relative to a field? a fixed cron? a delay after creation?), a migration for schedule config, and a Laravel `Console\Kernel` schedule + command. Not started, no code exists for it.
4. Carried over from the prior same-day session, still true: **Contacts/Clients/Tasks pages are not field-driven** — Settings lets you configure custom fields for those 3 entities but nothing shows up on those pages (only Leads and custom Record Types are field-driven). Not touched this session.
5. Keep an eye on the `aider`/gemini-2.5-flash process — it's actively committing to this same branch and has produced at least 2 severe regressions (silent runtime crashes that pass the build) in one pass. If it keeps running, periodically check its commits for the same "uses a hook/translation function without importing or receiving it" pattern.

## 6. Environment

- MySQL: XAMPP — `C:\xampp\mysql_start.bat`
- Backend: `cd "D:\new auto\backend" && php artisan serve` (port 8000)
- Frontend: `cd "D:\new auto\frontend" && npm run dev` (port 5173)
- Queue worker: `php artisan queue:work` (not required for automations specifically — they fire via Laravel's `dispatchAfterResponse`, which runs in-process after the HTTP response, bypassing the queue entirely regardless of `QUEUE_CONNECTION` — but still required for CSV imports, which use a real queued job)
- Login: `test@demo.local` / `password123`, tenant subdomain `localhost`
- Backend tests: `php artisan test` (142 passing). Frontend: `npx vite build` for a syntax/import check (does NOT catch missing-hook-import runtime crashes like the aider ones — those only surface live in a browser).

## 7. Failed attempts / lessons

- **`npx vite build` passing is not proof a page renders.** Both aider-introduced crashes (`GeneralTab`, `ContactsPage`) built cleanly — esbuild/Rollup don't fail on an undefined runtime identifier, only on an unresolved `import` statement. The only way either crash was caught was by actually loading the page in a browser. Don't trust a green build alone for pages you haven't opened.
- **Zero `AutomationLog` rows for an "active" automation is a strong signal, not proof of nothing — check it before assuming the feature just needs more time.** In this case it meant the automation could structurally never fire (dead trigger field), not that it just hadn't happened to trigger yet.
- Same lesson as the prior session (kept from before): CSV header-name lookups with embedded quotes, `JSON_EXTRACT` equality quoting mismatches, `SCHEMA_DB/` must be at repo root — see §9 below for the original detail if still relevant.

---

## 9. Prior context (same-day, earlier session — preserved)

Full-site audit + Sonia's document migration. Real, still-standing gap from that audit, unchanged: **Contacts/Clients/Tasks pages are 100% hardcoded, not field-driven** (see §5.4 above). Generic CSV import for all record types was implemented and unit-tested (142 backend tests including it) but its own live browser end-to-end test was flagged as not-yet-done in that session's notes — still true, not covered by anything in this session's browser testing (which focused on Settings/Automations, not the import wizard).
