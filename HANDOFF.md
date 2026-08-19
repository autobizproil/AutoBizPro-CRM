# HANDOFF — CRM (AutoBizPro) — 2026-08-19 (latest session, on top of everything below)

## 0. Latest session summary (2026-08-17 → 2026-08-19)

Two big pieces of work: (1) three more wire-format/onboarding fixes for the Make.com Facebook
bridge from the prior session, plus a demo tenant built for a sales call; (2) a full **Fireberry-
parity dashboard widget builder**, built in two phases (P1, then combined P2+P3) via
brainstorming → spec → plan → subagent-driven-development, fully deployed and live-verified.

### Make.com bridge — 3 more onboarding fixes, `make:activate-facebook-bridge` added

The prior session's `make:onboard-facebook-bridge` command needed 4 wire-format correction rounds
to work at all (see §0 below, unchanged). This session found 3 more gaps, live, while onboarding
`autobiz-crm`:

1. **`http:ActionSendData` v3's mapper was still incomplete** — Make's UI accepted the scenario via
   API but threw `BundleValidationError` on open, missing 7 boolean/auth fields (`serializeUrl`,
   `shareCookies`, `rejectUnauthorized`, `followRedirect`, `useQuerystring`, `gzip`, `useMtls`, plus
   `authUser`/`authPass`/`timeout`/`ca`). Fixed by matching the exact field set from sonia-crm's
   real hand-built blueprint.
2. **`metadata.instant` was missing** from the blueprint — without it a scenario is polling-based,
   not webhook-driven, so an activated scenario wouldn't actually fire automatically on new leads.
3. **Trigger module was wrong**: the command used `facebook-lead-ads:WatchLeads` (confirmed "the
   right module" earlier by trial and error), but a direct side-by-side comparison against sonia-
   crm's real, live-verified blueprint showed the actual correct trigger is
   `facebook-lead-ads:NewLeadMultiple` — same-looking `__IMTHOOK__` webhook parameter shape, but
   `WatchLeads` apparently doesn't fire instantly in practice. Fixed, including the module's
   required `v`/`fields` parameters copied verbatim from the real export.

All 3 fixes are in `backend/app/Console/Commands/OnboardFacebookBridge.php` and
`backend/app/Services/Integrations/MakeApiService.php`, commits `747d8017`→`6c788971`.

**New:** `make:activate-facebook-bridge {scenario_id}` (`MakeApiService::activateScenario()`) —
activates a scenario via Make's REST API after the operator manually connects the customer's
Facebook Page (the one click that can never be automated — Meta's own OAuth consent). Saves the
last remaining manual "Activate" button click. Commit `fa560fec`.

Also fixed two **infrastructure** bugs found while onboarding `autobiz-crm` live:
- Production `APP_URL` was `http://` while nginx force-redirects to `https://` — Make's HTTP module
  doesn't follow a 301 correctly on POST (redirect degrades it to GET), so the webhook silently
  broke. Fixed by correcting `APP_URL` in the server's `.env` to `https://`.
- **`route:cache` needs clearing on every deploy that touches `routes/api.php`, not just
  `config:cache`** — hit again this session (new widget-builder routes 404'd after a deploy that
  only ran `config:clear`/`config:cache`). This is documented in the prior session's handoff below
  but bears repeating: **every backend deploy from now on should run both**
  `php artisan config:clear && config:cache` **and** `php artisan route:clear && route:cache`,
  then restart php-fpm.

### Demo tenant built for a sales call — `demo-autobiz.duckdns.org`

New tenant (id 3, subdomain `demo-autobiz`), full nginx vhost + Let's Encrypt SSL, added to
`SANCTUM_STATEFUL_DOMAINS` (missing this caused an immediate post-login 401 — same class of bug as
the `route:cache` one, a new domain needs 3 separate registration points: DNS, nginx+SSL, and
Sanctum's stateful-domains list). Login `demo@demo.com` / `demo1234`. Seeded with realistic demo
data (leads across all pipeline stages, clients, contacts, tasks) so the demo doesn't look empty.

### Meta App Review — root cause of the "permissions absent from catalog" mystery found

Not resolved, but the mechanism is now understood: Meta's Marketing API gates **Advanced Access**
behind a **test-call quota** per permission (visible under App Dashboard → Products → Marketing
API — "0 of 1 API call(s) required" style counters for `business_management`/`ads_read`/
`ads_management`, plus an overall "0 of 500" tier counter), separate from Business Verification.
Walked through satisfying the three "0 of 1" counters via Graph API Explorer (`GET /me/businesses`,
`GET /me/adaccounts`, `GET /act_{id}/campaigns`) — as of session end the dashboard hadn't visibly
updated yet (known to lag, same as Business Verification's own 24-48h delay). **Next step when
resuming:** check whether those three counters now show 1/1; if the Marketing API tier itself needs
500 calls before `leads_retrieval`/`pages_manage_metadata` become requestable, that's a much bigger
volume of legitimate API usage to generate, not yet planned for.

---

## 0.1 Fireberry-parity dashboard widget builder — P1 + P2/3, DEPLOYED, LIVE-VERIFIED

Full rebuild of the "לוחות בקרה" (Dashboards) widget system to match a competitor CRM (Fireberry)
the user is migrating customers away from, built directly from live Fireberry screenshots the user
captured mid-session. Two plans, executed via `superpowers:subagent-driven-development`
(implementer + reviewer per task, fix loops, final whole-branch review), all on `master` directly
(this project's established pattern — no long-lived feature branches, deploy straight from master
after each plan completes).

**Design docs:**
`docs/superpowers/specs/2026-08-17-fireberry-widget-builder-design.md` (P1 spec + a P2/3 addendum
added mid-session once the user confirmed AND/OR filter groups from a screenshot).
`docs/superpowers/plans/2026-08-17-fireberry-widget-builder-p1.md` (8 tasks) and
`docs/superpowers/plans/2026-08-18-fireberry-widget-builder-p2p3.md` (11 tasks).

### P1 — foundation (commits `fb713ea0`→`03ccb842`)

- **`EntityDescriptor`** (`backend/app/Services/Reporting/EntityDescriptor.php`) — static registry
  of which columns each of 5 entities (lead/client/contact/task/activity) exposes to the widget
  builder: `valueFields`/`groupFields`/`filterFields`/`dateFields`, each field typed
  (`enum`/`lookup`/`text`/`date`/`number`) with Hebrew labels. **This is the security boundary** —
  every column name that reaches SQL anywhere downstream is looked up here first; an unlisted field
  name is silently dropped, never interpolated.
- **`RelativeDateRange`** — all ~42 of Fireberry's relative date operators (היום, חודש קודם, רבעון
  נוכחי, 90 ימים אחרונים, etc.), captured from a live screenshot of the actual dropdown, resolved to
  concrete `[from, to]` Carbon ranges.
- **`WidgetDataService::aggregate()`** — the generic aggregation engine. Builds a query from
  `EntityDescriptor`, applies owner-role scoping (agents see only their own rows; activities scoped
  through leads they own since activities have no owner column of their own), time-period filtering,
  and conditions, then either returns a single total or a grouped breakdown.
- **`WidgetController`** — `GET /dashboard/widget-fields` (metadata for the UI: entities, their
  fields, date operators, aggregations, user/stage lookups) and `GET /dashboard/widget-data` (runs
  one widget's aggregation; `timePeriod`/`conditions` arrive JSON-encoded).
- **Frontend**: `AddWidgetModal.jsx` rebuilt in Fireberry's exact field order (סוג נתונים → כותרת →
  ערכים → שדה להצגה → צבע → תקופת זמן → סינון רשומות), `FilterValueInput.jsx`/`LookupSelect.jsx` for
  smart filter values (enum dropdowns, searchable user/stage lookups instead of free text).

**Final review caught two real bugs, both fixed and re-verified before deploy:**
1. `custom_fields` JSON column was hardcoded for every entity in `ConditionFilter` calls — `task`/
   `activity` have no such column, so a `cf_*` condition against them threw an uncaught 500. Fixed
   by adding a `jsonColumn` key (nullable) to each descriptor.
2. Grouped queries had no `LIMIT`, then after adding one, the returned `total` was computed by
   summing only the (now-capped) visible rows — silently undercounting whenever a group had more
   than 50 distinct values. Fixed by computing `total` from a separate unlimited query.

### P2+P3 — combined, built together per user request (commits `b0dd8c95`→`f2e7937c`)

- **Drill-down** — clicking a bar/pie segment opens a modal with the underlying records, reusing
  each entity's existing list endpoint (already supports `conditions`) plus a new equals-condition
  on the clicked segment. `activity` has no generic list endpoint, so it shows a "no list view
  available" message instead of crashing.
- **Second grouping dimension** — `groupBy: {field, granularity}` produces a `seriesKeys`/`rows[].series`
  shape instead of flat `rows[].total`, rendered as grouped or stacked multi-series bar charts.
  Date-field granularity (day/week/month/year) via `DATE_FORMAT` with a whitelisted pattern
  (`%x-W%v` for ISO week — verified against real production MySQL: `2026-08-19` → `2026-W34`,
  `2026-01-01` → `2026-W01`, correct year-boundary rollover).
- **KPI target** — optional `target` number, renders a "יעד: X" line + progress bar.
- **AND/OR condition groups** — `conditions` (AND, unchanged from P1) + new `orConditions` array,
  composed as `AND-group AND (or1 OR or2 ...)`. `ConditionFilter::apply()` gained a 6th optional
  `$boolean = 'and'` parameter (default preserves all 6 existing callers' behavior unchanged).
- **טבלת מדדים (metrics table)** widget type — a grid of independent mini-KPI tiles, each its own
  `entity`/`aggregation`/`conditions`, N parallel calls to the existing `widget-data` endpoint.
- **Server-side board persistence** — new `dashboard_boards`/`dashboard_widgets` tables (tenant +
  user scoped, `config` as an opaque JSON blob so the widget shape can keep evolving without a
  migration every time), replacing `localStorage['crm_boards_v2']`. One-time migration on first
  load uploads any existing local boards to the server.

**Final review found 2 Critical + 6 Important; all fixed and re-verified:**
- Missing HTTP plumbing: `orConditions`/`groupBy` weren't actually being decoded in
  `WidgetController::data()` — only tested, never wired to the real request.
- React hooks-order violation: the `metrics_table` early-return sat before a `useQuery` call,
  conditionally skipping a hook.
- (6 Important, not itemized here — see git log around commit `5b018515` if needed.)

**Task-level review also caught, separately:**
- KPI widgets showed `'—'` instead of a live value in the Add Widget modal's own preview pane
  (preview branch wasn't distinguishing KPI's bare-number payload from chart widgets' `.rows`
  payload) — fixed, re-verified.
- **Critical data-loss bug in the localStorage migration**: the original logic used
  `listBoards().length > 0` as a signal to skip-and-clear localStorage — but that can't distinguish
  "genuinely already migrated" from "a previous migration attempt partially failed." A retry after
  partial failure would **actively delete** the still-un-migrated boards from localStorage,
  permanently, silently. Fixed by migrating one board at a time, shrinking and re-persisting the
  pending list after each individual success, only fully clearing localStorage once the pending
  list is empty. Traced and re-verified control-flow by control-flow before merge — this was the
  single highest-risk piece of the whole plan and got the most scrutiny.

**Neither plan's frontend tasks (P2/3 tasks 6, 8, 10, 11) ever ran against a live dev server during
implementation** — no safe dev environment was available to implementer subagents, and project
convention discourages unrequested browser automation. All manual/live verification for this
feature happened afterward, directly by the controlling session, against the real deployed
`demo-autobiz` tenant (see below) — not during task execution itself. Worth knowing if this pattern
repeats: budget explicit time for a post-deploy live pass, don't assume task-level "tests pass" is
equivalent to "someone clicked it."

### Post-deploy fixes (found live, by the user actually using it)

Several real bugs only surfaced once the user started clicking around on the deployed feature —
each was found, fixed, tested, and redeployed the same session:

1. **`ChartTable` had zero dark-mode classes** (P1-era code, predates dark mode support elsewhere)
   — text was near-invisible in dark mode. Also the raw `key` field (added in P2/3's row mapping)
   was leaking into the table as an untranslated column. Both fixed.
2. **Widget title field was completely hidden for טבלת מדדים widgets** — `AddWidgetModal`'s form
   panel wrapped the whole "כותרת הגרף" input inside the `type !== 'metrics_table'` branch of its
   ternary, so a metrics-table widget had no way to set its own title. Moved above the branch.
3. **No real numeric field existed on any entity** — the "ערכים" (values) dropdown for
   sum/avg/max/min aggregation was permanently locked to "מספר רשומות" (count-only) because
   `valueFields` was empty everywhere in P1's `EntityDescriptor`. Added `leads.deal_value` (nullable
   decimal, migration `2026_08_19_000001_add_deal_value_to_leads.php`) and wired it into the
   descriptor — this is the first real numeric field, unlocking the aggregation dropdown end to end.
4. **Custom record types (RecordType/Record — tenant-defined types like "חשבוniot") had zero
   representation in the widget builder.** Added dynamic resolution: entity keys of the form
   `record:<slug>` build an `EntityDescriptor`-shaped array on the fly from that tenant's
   `CustomFieldDefinition` rows (every field lives in `records.data` JSON, no fixed columns — a new
   `columnExpr()` helper resolves group/value/filter/date fields to either a plain column or a
   `JSON_EXTRACT` expression depending on the descriptor, replacing every direct
   `"{table}.{field}"` interpolation in `aggregate()`). `ConditionFilter`'s existing
   `allFieldsAreJson` mode (already built for `RecordController`, just never wired here) handles
   condition filtering. **Frontend needed zero changes** — `AddWidgetModal` already renders whatever
   `WidgetController::fields()` returns as entity options.
5. **Totals and group labels showed raw SQL precision** (e.g. "4500.0000") — `JSON_EXTRACT` on
   custom-record numeric fields and the `CAST(...AS DECIMAL(18,4))` used for their aggregation both
   surface far more precision than makes sense to display. Every total (ungrouped, per-group,
   per-series) is now rounded to 2 decimals server-side, and numeric-looking group labels are
   formatted the same way via a shared `formatKey()` helper.
6. **Drill-down had no way to open the actual record**, and no tile showed when a widget was
   created. Added: every KPI/metrics tile now shows "נוצר בתאריך: DD/MM/YYYY" (the widget's real DB
   row `created_at`, threaded through `fromServerBoard`). Drill-down's first column is now a
   clickable link — for leads it navigates to `/leads?open=<id>` (new deep-link support added to
   `LeadsPage.jsx`, reading the query param once on mount to auto-open that lead's existing detail
   panel). Clients/tasks/contacts have no dedicated single-record view in this app at all (only
   inline row editing) — clicking their drill-down rows lands on the right list page, not the exact
   record. **If a real detail view is ever wanted for those 3 entities, that's new scope.**
7. **`RecordsPage.jsx` had 5 missing i18n keys** (`created_at`, `no_records_yet`,
   `add_first_record`, `records_loading`, `records`) — none existed in `translations.js`, so the
   `tr()` fallback (return the key itself) rendered literally: a column header reading
   `created_at`, an empty-state reading `no_records_yet`. This was the dominant cause of the page
   "not looking elegant" — fixed, both Hebrew and English.

### Deploy pattern used throughout this session (worth codifying)

nginx's docroot is `backend/public/`, but `npm run build` outputs to `frontend/dist/` — this exact
gotcha is already documented in the prior session's handoff below, and was hit/handled correctly
every single deploy this session using this sequence:
```bash
git pull origin master
cd backend && sudo -u www-data php artisan config:clear && sudo -u www-data php artisan route:clear
sudo -u www-data php artisan config:cache && sudo -u www-data php artisan route:cache
sudo systemctl restart php8.3-fpm
# only if a migration was added this deploy:
sudo -u www-data php artisan migrate --force
# only if frontend files changed:
cd ../frontend && npm run build
cd .. && sudo rm -rf backend/public/assets && sudo cp -r frontend/dist/assets backend/public/assets
sudo cp frontend/dist/index.html backend/public/index.html
sudo chown -R www-data:www-data backend/public
```
Consider actually writing this into `deploy/README.md` or a small script — it's been reconstructed
from memory correctly every time so far, but that's luck, not process.

### Next steps when resuming

1. Check the Meta Marketing API test-call counters (see §Meta App Review above) — did the 3 "0 of 1"
   counters clear? Does the 500-call tier counter block `leads_retrieval` regardless?
2. The two remaining open items from the widget-builder design spec, deliberately parked: a "מתקדם"
   nested-group filter UI beyond simple AND/OR (if Fireberry's is actually more complex than the two
   flat groups already built — never confirmed beyond one screenshot), and giving clients/tasks/
   contacts a real single-record detail view so drill-down can deep-link into them the way leads
   already can.
3. `docs/superpowers/plans/*.md` and the SDD ledgers under `.superpowers/sdd/` for both plans were
   cleaned up (workspace deleted) after each plan's final review passed clean — the plans themselves
   are committed to git and are the durable record if this work needs revisiting.

---

# Prior HANDOFF — 2026-08-14 (kept below for continuity)

## 0. Latest session summary (2026-08-12 → 2026-08-14)

**Facebook Lead Ads integration — two parallel tracks. Track A (direct OAuth) is built, merged, and
deployed but blocked on Meta; Track B (Make.com bridge) is built, deployed, and verified live end-to-end
for the first customer (sonia-crm) — a real test lead flowed from Facebook through Make into the CRM.**

### Track A: Direct Facebook OAuth connect — DONE, DEPLOYED, BLOCKED ON META

Full one-click "Connect with Facebook" flow replacing the old manual app_id/secret/page_id form.
Built via superpowers brainstorming → spec → plan → subagent-driven-development, 9 tasks +
1 final-review fix round, on branch `worktree-facebook-oauth-lead-ads`.

- Spec: `docs/superpowers/specs/2026-08-11-facebook-oauth-lead-ads-design.md` (includes an
  "Addendum: OAuth callback identity" — a real architecture bug caught mid-plan: the callback route
  can't sit behind Sanctum session auth because Facebook's redirect is cross-origin and never
  carries the session cookie. Fixed with a signed/encrypted `state`/`pages_token` instead of
  session — read this before touching `FacebookOAuthController` again).
- Plan: `docs/superpowers/plans/2026-08-11-facebook-oauth-lead-ads.md`.
- Merged: [PR #3](https://github.com/autobizproil/AutoBizPro-CRM/pull/3) (main 9-task feature +
  final-review fix for a cross-tenant data leak the whole-branch review caught — `selectPage()`
  never bound `current_tenant_id` before writing settings), [PR #4](https://github.com/autobizproil/AutoBizPro-CRM/pull/4)
  (follow-up: switched from raw OAuth `scopes()` to Facebook Login for Business's `config_id`
  mechanism — see below).
- **Deployed to production** (both `autobiz-crm.duckdns.org` and `sonia-crm.duckdns.org` — same VPS,
  same app, two DuckDNS hostnames pointing at one nginx config). `FACEBOOK_APP_ID`,
  `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI`, `FACEBOOK_VERIFY_TOKEN` are set in production
  `.env`. Migration ran, config cached, frontend rebuilt and copied to the real docroot (see deploy
  gotcha below).

**Currently blocked:** the Meta App's permission catalog (App Dashboard → Permissions and features)
does not list `leads_retrieval` or `pages_manage_metadata` at all — not "needs review", not
"limited access", just absent from the list entirely — even after completing Business Verification
(confirmed complete, ~24-48h after submission). Checked and ruled out during this session:
- Graph API Explorer's permission picker: same absence.
- Facebook Login for Business → Configurations → Choose permissions: same absence.
- Business Settings → Pages → the specific Page → no "Lead Access"/CRM-grant tab found there either
  (only got as far as the general "CRM setup" screen under Instant Forms, which is Meta's own
  Zapier/HubSpot/Gmail/Sheets marketplace — a different, unrelated feature).

**Root cause is genuinely unknown** — could be a slow catalog-sync delay after verification, or a
real App Review requirement Meta doesn't surface clearly for this permission pair anymore. Not
resolved this session. `FACEBOOK_CONFIG_ID` is still empty in production `.env` — the OAuth
`redirect()` call reads it from `config('services.facebook.config_id')` and will start working the
moment a real Configuration with both permissions can be created and its ID pasted in — no code
changes needed at that point, just: `sudo nano ~/AutoBizPro-CRM/backend/.env`, add
`FACEBOOK_CONFIG_ID=...`, then `sudo -u www-data php artisan config:clear && config:cache`.

**Deploy gotcha worth knowing for next time:** `frontend/npm run build` outputs to `frontend/dist/`,
but nginx's actual docroot for this app is `backend/public/` (see
`/etc/nginx/sites-enabled/crm` / `sonia-crm` → `root /home/ubuntu/AutoBizPro-CRM/backend/public`).
The deploy README (`deploy/README.md`) doesn't mention copying `dist/` into `backend/public/` — this
cost real debugging time this session (site kept serving a stale build from 2026-07-24 despite a
fresh `npm run build`, because nobody was ever copying the output over). The actual command needed
after every frontend build:
```bash
sudo rsync -a --delete frontend/dist/assets/ backend/public/assets/
sudo cp frontend/dist/index.html backend/public/index.html
sudo chown -R www-data:www-data backend/public/assets backend/public/index.html
```
Also found on the server this session: leftover uncommitted `.gitignore` diffs in `storage/`
(harmless, cleared via `sudo git checkout --`) and a pile of bizarre untracked files with literal
shell-fragment names (`backend/->stream = null;`, `backend/sudo`, etc.) — looked like an old
copy-pasted command that got mis-interpreted as shell redirection at some point. Left untouched,
didn't block anything, worth a manual cleanup pass sometime but not urgent.

**Server access:** SSH key at `D:\new auto\fix_key.key` (also present as `fix_key.key`/`new.key` in
the repo root, untracked — do not commit these), `ssh -i "D:/new auto/fix_key.key" ubuntu@autobiz-crm.duckdns.org`.
Passwordless `sudo` available. PHP-FPM service is `php8.3-fpm` (not 8.2, despite what
`deploy/README.md` says — the setup script apparently installed 8.3). DB creds are in the server's
own `.env`, not reproduced here.

### Track B: Make.com bridge — DEPLOYED, VERIFIED LIVE FOR SONIA-CRM (2026-08-14)

Two or three real customers are waiting on Lead Ads *now* and can't wait on Meta's unknown timeline.
Decided this session: route leads through Make.com instead (Make's own app already has Meta's
approval for these permissions, sidestepping the whole blocked chain), while Track A stays dormant
and activates for free once/if Meta's permissions open up.

- Spec: `docs/superpowers/specs/2026-08-13-make-facebook-lead-bridge-design.md` — written and
  committed this session, matches what shipped (endpoint path corrected during the fix-review pass,
  see below).
- Model: **managed onboarding**, not self-serve. For each waiting customer, autobizpro builds one
  Make.com scenario (autobizpro's own Make account) with a Facebook Lead Ads → Watch Leads trigger,
  connects it to the customer's Page (customer just clicks "Allow" on Meta's own consent screen
  during a short call), and points a new backend endpoint as the action's target.
- **Implemented and tested**, `IntegrationsController::generateMakeWebhookSecret` /
  `IntegrationsController::makeLeadWebhook`:
  - `POST /api/integrations/make-webhook-secret/generate` (admin-only) generates the per-tenant
    secret, stored as `make_lead_webhook_secret` in `tenant_settings` — same mechanism as
    `voicenter_webhook_secret`.
  - `POST /api/integrations/make/lead/{tenant}` (public route) — Make.com's HTTP module posts here
    with the secret in an `X-Webhook-Secret` header, compared with `hash_equals`. Body:
    `{name?, phone?, email?, form_name?}`, at least one of name/phone/email required. Creates a
    `Lead` with `source = 'פייסבוק (Make)'`, going through `LeadObserver` like every other
    lead-creation path. No Graph API calls, no dedup logic needed (Make's own trigger cursor
    prevents redelivery under normal operation).
  - Tests: `backend/tests/Feature/MakeLeadBridgeTest.php`, 8 tests covering the happy path, wrong/
    missing secret, unknown tenant, missing-name-key edge case (was a 500 crash, fixed in the
    whole-branch review — see `$data['name'] ?? null` in the controller), missing-all-contact-fields
    422, no-secret-configured, and automation firing through this path. All passing.
- **No frontend/UI exists yet** for triggering secret generation — deliberate, out of scope per the
  spec's Non-goals. It's called manually (curl/Tinker) by whoever sets up a customer's Make scenario
  during onboarding.

**Deployed to production (2026-08-14):** `git pull` on the VPS, `composer install`, then
`sudo -u www-data php artisan config:clear && config:cache`, `sudo systemctl restart php8.3-fpm`.
`fb_leadgen_id` migration was already applied from an earlier Track A deploy (`Nothing to migrate`).

**New deploy gotcha found this session — route cache.** After deploying, the Make scenario's HTTP
call returned a `404` with a large HTML body (not our controller's small JSON 404) even though the
route existed in the pulled code. Cause: `bootstrap/cache/routes-v7.php` was stale (dated before this
deploy) — `config:clear`/`config:cache` do **not** touch the route cache. Fix:
`sudo -u www-data php artisan route:clear && sudo -u www-data php artisan route:cache`, then restart
php-fpm. **Every future backend deploy that adds/changes routes must run `route:clear`+`route:cache`
in addition to the `config:clear`+`config:cache` step already documented above (Track A) and in
`deploy/README.md` — the README doesn't mention this yet, worth fixing there.**

**sonia-crm's `make_lead_webhook_secret`** was generated via `php artisan tinker` on the server
(scoped to tenant id 2 with `app()->instance('current_tenant_id', 2)`) rather than through the real
HTTP endpoint, since no admin session was available at the time — functionally identical (same
`SettingsService::set` call the endpoint makes), but worth knowing the value wasn't generated through
the "real" path if that matters later. Value is in `sonia-crm`'s `tenant_settings` row; not
reproduced here.

**Make scenario for sonia-crm:** built manually in Make's UI (team id `1047106`, name "Sonia CRM -
Facebook Lead Ads Bridge") — trigger `facebook-lead-ads:WatchLeads` (v2) connected via הראל's
Facebook connection to Page "אוטוביז פרו ישראל (Netivot)", form "בדיקה" (**test page/form — not
sonia's real Page/form yet**, swap before relying on this for real customer leads), action
`http:ActionSendData` POSTing to `https://sonia-crm.duckdns.org/api/integrations/make/lead/sonia-crm`
with the secret above. **Verified live**: a real test lead submitted via Meta's Lead Ads Testing Tool
(https://developers.facebook.com/tools/lead-ads-testing/) flowed through Make → the endpoint → landed
in the CRM as a real `Lead` with `source = 'פייסבוק (Make)'`.

Note: the Claude-side Make MCP connector's OAuth grant has no organization/app-read scope (confirmed
via the "Show scopes" screen on the Claude OAuth connection in Make's API access settings — no
"Organizations" section exists in the grantable scopes at all for this connector), so
`scenarios_list`/`connections_list`/`apps_list`/`app-modules_list` all fail with "Insufficient rights,
admin permission organization view is needed" regardless of team/org ID passed. Scenario building for
this tenant was done by hand in Make's UI instead — a hand-built `scenarios_create` blueprint attempt
with a guessed trigger module (`facebook-lead-ads:watchLeads` v3) failed to import; the real module
turned out to be `facebook-lead-ads:WatchLeads` (capital W, v2) with a real Facebook connection and
`{{N.data.full_name}}`-style nested field paths (fields live under a `data` collection in the actual
interface, not top-level) — useful to know if attempting this again for another customer.

**`make:onboard-facebook-bridge` command — built, deployed, VERIFIED LIVE (2026-08-14).**
`php artisan make:onboard-facebook-bridge {tenant}` (flag: `--regenerate-secret`) replaces the manual
Make-UI scenario building done by hand above for sonia-crm — it generates the per-tenant secret and
creates the Make scenario (trigger + HTTP action module) via Make's REST API instead of clicking
through the UI. Production `.env` has `MAKE_API_TOKEN` (a Make **personal API token**, generated from
Make's own UI — NOT the Claude/MCP OAuth connection, which has no organization/app-read scope, see
note above) and `MAKE_TEAM_ID=1047106` set.

**First real run** was for the `autobiz-crm` tenant ("דמו דלתות", a demo tenant — safe first test, not
a real customer) and took **4 wire-format correction rounds** against Make's real API before it
worked (exactly the risk `docs/superpowers/plans/2026-08-14-make-onboarding-automation.md`'s Task 3
flagged — the original request shape was never verified against a live token while writing the plan).
All 4 fixes are in `backend/app/Services/Integrations/MakeApiService.php` and
`backend/app/Console/Commands/OnboardFacebookBridge.php`, commits `2c0b192`→`62e64e1`:
1. `Http::asForm()` (urlencoded) → Make rejected with "Missing value of required parameter" for
   `teamId`/`blueprint`/`scheduling`, even though all three were sent.
2. `Http::asMultipart()` → same error, verbatim.
3. Plain JSON body with `blueprint`/`scheduling` as nested JSON objects → progress (`teamId` now
   accepted) but "Invalid json string in parameter 'blueprint'. Value has to be string."
4. JSON body with `blueprint`/`scheduling` values each `json_encode()`'d into a **string** (so: JSON
   envelope, string-typed inner fields) → progress again, but `flow[0].parameters` rejected as
   "should be object, type: 'object'" — PHP's `json_encode([])` on an empty array emits `[]`, not
   `{}`. Fixed by casting empty `parameters`/`mapper` fields to `(object) []`.

**Confirmed working wire format** (for the next time this needs touching): `POST
{api_base_url}/scenarios?teamId={id}`, `Content-Type: application/json`, body
`{"teamId": <int>, "blueprint": "<json-encoded string>", "scheduling": "<json-encoded string>"}`,
every empty object field inside the blueprint cast to `(object) []` not `[]`.

Real output from the live run: `Scenario created: https://eu1.make.com/1047106/scenarios/6967712` for
autobiz-crm — this scenario now exists in Make with the HTTP action fully wired, trigger module
present but unconnected (as designed). Not yet connected to a real Facebook Page or activated — that
part was left for the actual next real customer, since autobiz-crm was just the wire-format proof.

**Next steps when resuming:**
1. Swap sonia-crm's Make scenario from the test Page/form ("אוטוביז פרו ישראל (Netivot)" / "בדיקה")
   to the customer's real Facebook Page and real lead form, then verify one real (non-test) lead.
2. Run `php artisan make:onboard-facebook-bridge {tenant}` for the other 1-2 waiting customers — the
   command is now proven end-to-end, no more wire-format surprises expected. Then open the printed
   Make URL, connect that customer's real Facebook Page + form, Activate, and verify one real lead
   (same pattern already proven for sonia-crm).
3. The `autobiz-crm` demo scenario created during this session's live verification
   (https://eu1.make.com/1047106/scenarios/6967712) can be deleted if not wanted, or left as a
   reference example — it's not connected to anything live.
4. If a self-serve secret-generation UI is ever wanted, that's new scope beyond the current spec.
5. Consider fixing `deploy/README.md` to include the `route:clear`+`route:cache` step (see gotcha
   above) — every deploy that touches `routes/api.php` needs it, not just this one.

---

# Prior HANDOFF — 2026-07-26 (kept below for continuity)

## 0. Latest session summary (2026-07-26)

Three features built via superpowers brainstorming → spec → plan → subagent-driven-development, each on its own short-lived feature branch, merged to `master` and pushed to `origin/master`. All commits on `master`, no branches left over.

1. **Generic "Delete All" bulk action** — replaces the old leads-only `/api/leads/all/clear` with one endpoint `DELETE /api/entities/{entity}/all` (`BulkDeleteController`), covering leads/contacts/clients/tasks and every custom record type. Frontend: shared `DeleteAllModal` (real modal, types "מחק" to confirm — not `window.prompt` like before) + `useDeleteAllEntity` hook, wired into all five list pages near the pagination/footer area. Spec: `docs/superpowers/specs/2026-07-24-generic-delete-all-design.md`.

2. **Generic advanced filter system** — extracts `LeadService::applyConditions` into `App\Services\ConditionFilter` (date-range + multi-condition filtering, reused by all entities), wires it into Contacts/Clients/Tasks/Records list endpoints, and reuses the existing `FilterPanel.jsx` component (already generic, untouched) across all five pages. Records use a distinct `allFieldsAreJson=true` mode (every field lives in `data`, no `cf_` prefix) with a regex-validated field name (`/^[a-z0-9_]+$/`) to prevent SQL injection since there's no prefix to anchor on. Tasks has no `custom_fields` column — its filtering is system-fields-only, a pre-existing gap, not fixed here. Spec: `docs/superpowers/specs/2026-07-26-generic-advanced-filters-design.md`.

3. **Customizable top navigation** — `frontend/src/lib/navLayout.js` (`computeNavLayout`/`saveNavLayout`, localStorage-backed, per-user/per-browser, versioned like the existing column-order pattern) + `NavEditModal.jsx` (drag-to-reorder between main bar and "עוד") wired into `Layout.jsx`. Custom record types are now full nav participants (reorderable/pinnable) instead of being stuck in a fixed always-in-More section. Spec: `docs/superpowers/specs/2026-07-26-nav-customization-design.md`.

**Backend: 170/170 tests passing** (up from 159 at start of session — ConditionFilter + per-entity filter tests). **Frontend: `npx vite build` clean, `npx vitest run` 6/6 passing** (new `navLayout.test.js`).

**Not yet deployed to VPS** as of this handoff — deploy commands: `git pull origin master`, `php artisan config:clear && php artisan cache:clear`, `sudo systemctl restart php8.3-fpm`, then `cd frontend && npm run build` (frontend changed this time, needs a rebuild, not just backend).

**Not yet verified live in a browser**: nav customization (drag-reorder/save/persist/reset) — every reviewer in this session lacked browser access, so it's build+unit-test verified only, never click-tested. Do this before trusting it fully.

**Still outstanding from the original request this session started from**: "Saved Views + persistent active filter" (e.g. a named view "לידים חדשים, 20 יום אחרונים" that stays selected across reloads until manually changed) — the advanced filter system it depends on is now done, but saved-views itself was never spec'd or built. Confirmed design direction (from brainstorming, not yet written as a spec): DB-backed per-user (not localStorage), applies to all five entities like the filter system did.

**Environment quirk hit repeatedly this session, worth knowing for next time:** subagent implementer worktrees kept forking from a stale base (missing already-merged prior tasks in the same plan), even mid-plan. Every time, the fix was the same: extract the worktree's diff for just the intended files via `git diff <stale-base> HEAD -- <files>`, then `git apply` it onto the actual shared-checkout branch tip, rebuild/retest there, and commit from the main checkout — never trust the worktree's own commit SHA directly into a `git merge`. Also hit an org-wide **monthly spend limit** on subagent dispatch near the end of this session (blocked one `opus` final-review dispatch) — if that recurs, the controller can do a manual/lighter final check itself instead of retrying the same dispatch.

---

# Prior session — 2026-07-24

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
