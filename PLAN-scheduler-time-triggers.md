# PLAN — Laravel Scheduler + Time-Based Automations + Task Due Reminders

## Goal

The CRM currently has **zero time-based capability**: `routes/console.php` contains only the default `inspire` command, no `Schedule::` entries exist anywhere, tasks have `due_at` but nothing ever fires when a task becomes due, and automations only react to events (`lead_created`, `lead_stage_changed`, `lead_status_changed`, `client_created`, `contact_created`, `form_submitted`). This plan adds: (a) the scheduler skeleton, (b) a `time_based` automation trigger ("lead sat in stage X for N days"), (c) task due-soon reminders. This unlocks the entire follow-up/reminder category and the AGENT_ROADMAP playbook "no answer 3× → follow up".

## Current reality (verified 2026-07-12)

- Laravel 11+ style app: no `app/Console/Kernel.php`; scheduled tasks belong in `routes/console.php` via `Schedule::` facade.
- `backend/app/Services/AutomationEngine.php` — `fire(string $triggerType, Model $entity)` matches `automations.trigger_type` and queues `RunAutomationJob::dispatchAfterResponse(...)`.
- `backend/app/Jobs/RunAutomationJob.php` — executes `actions` array, writes `AutomationLog` (`automation_id, entity_type, entity_id, status, error_message, ran_at`).
- `backend/app/Models/Automation.php` — fillable: `tenant_id, name, trigger_type, conditions, actions, active`.
- Frontend trigger list: `frontend/src/pages/automations/AutomationsPage.jsx:10` `TRIGGER_LABELS`.
- Tasks: `tasks` table with `due_at`, `status`, `assigned_to`, `related_type/related_id`; `TaskController` orders by due_at; **no reminder mechanism**.
- Queue: database driver (`jobs` table); worker must run (`php artisan queue:work`) — HANDOFF §8: **restart worker after every backend edit**.
- Tenancy: models use a `tenant` global scope keyed off `app('current_tenant_id')`; jobs set `app()->instance('current_tenant_id', ...)` manually (see RunAutomationJob:37).

## Files to touch

1. `backend/routes/console.php` — schedule definitions
2. `backend/app/Console/Commands/RunTimeBasedAutomations.php` — NEW
3. `backend/app/Console/Commands/SendTaskReminders.php` — NEW
4. `backend/database/migrations/2026_07_12_000001_create_automation_time_fires_table.php` — NEW (+ mirrored `SCHEMA_DB/2026_07_12_000001_create_automation_time_fires_table.sql` — **project law: every schema change gets a SCHEMA_DB mirror, ALTERs use IF NOT EXISTS**)
5. `backend/database/migrations/2026_07_12_000002_add_reminded_at_to_tasks_table.php` (+ SCHEMA_DB mirror)
6. `backend/app/Jobs/RunAutomationJob.php` — no change needed (reused as-is)
7. `frontend/src/pages/automations/AutomationsPage.jsx` — trigger UI
8. `backend/tests/Feature/AutomationTest.php` — extend
9. `HANDOFF.md` dev-env section — add `php artisan schedule:work` requirement

## Implementation order

### Step 1 — Migrations first (riskiest, do carefully)

`automation_time_fires` — dedupe ledger so the same automation never double-fires for the same entity in the same "epoch":

```sql
CREATE TABLE IF NOT EXISTS automation_time_fires (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    automation_id BIGINT UNSIGNED NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id BIGINT UNSIGNED NOT NULL,
    fired_at TIMESTAMP NOT NULL,
    UNIQUE KEY atf_unique (automation_id, entity_type, entity_id),
    CONSTRAINT atf_automation_fk FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
);
```

`tasks.reminded_at TIMESTAMP NULL` via `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMP NULL` (Laravel migration: `Schema::table` guarded by `Schema::hasColumn`). Read existing migrations in `backend/database/migrations/` before numbering — do not collide.

Run `php artisan migrate --force` (allowed per HANDOFF; do NOT use migrate:refresh).

### Step 2 — Time-based trigger semantics (keep MVP narrow)

New `trigger_type = 'time_in_stage'`. Automation `conditions` for this trigger carry the schedule config (reuse the existing JSON column, no schema change):

```json
[{ "field": "pipeline_stage_id", "operator": "=", "value": 3 },
 { "field": "_days_in_stage", "operator": ">=", "value": 7 }]
```

The special `_days_in_stage` condition is consumed by the command, not by `AutomationEngine::conditionsPass` (underscore prefix = command-level config). Simplification that keeps AutomationEngine untouched.

### Step 3 — `RunTimeBasedAutomations` command

`php artisan automations:run-time-based`. Logic:

1. Iterate tenants that have any active `trigger_type='time_in_stage'` automation (`Automation::withoutGlobalScope('tenant')->where(...)->pluck('tenant_id')->unique()`).
2. Per tenant: `app()->instance('current_tenant_id', $tenantId)`.
3. Per automation: extract `_days_in_stage` (default 3) and optional `pipeline_stage_id` from conditions. Query leads: `Lead::withoutGlobalScope('tenant')->where('tenant_id',$tid)` + stage filter + `updated_at <= now()->subDays(N)` — **`updated_at` is the proxy for "entered stage at"; there is no stage_entered_at column. Document this approximation in a comment; any lead edit resets the clock. Acceptable for MVP.**
4. Skip leads already in `automation_time_fires` for this automation (`whereNotIn` / left-join).
5. For each remaining lead: `insertOrIgnore` into `automation_time_fires` FIRST (the unique key makes this the idempotency gate — if two scheduler runs overlap, only one wins), then `RunAutomationJob::dispatch($automation->id, Lead::class, $lead->id, $tid)` — **use `dispatch`, not `dispatchAfterResponse`: there is no HTTP response in a console command; `dispatchAfterResponse` in console context runs synchronously, which is acceptable but blocks the scheduler tick on slow actions. Use `dispatch()` to go through the queue.**
6. Cap per run: `->limit(500)` leads per automation per tick to bound worst-case (5,564 leads exist in dev DB).

### Step 4 — `SendTaskReminders` command

`php artisan tasks:send-reminders`. Per tenant with tasks due: select `Task::withoutGlobalScope(...)` where `status != 'done'` (verify actual status values in `TaskController::store` validation first — read it), `due_at <= now()->addHours(24)`, `reminded_at IS NULL`. For each: create an `Activity` (type `note`, body "משימה מתקרבת: {title}") if the task has `related_type='lead'`, and call `NotificationService::sendEmail` to the assigned user if tenant email settings exist (read `backend/app/Services/NotificationService.php` first — match its existing signature `sendEmail($tenantId, $action, $context)`; if it requires an `$action['to']`, pass the assignee's email). Set `reminded_at = now()` in the same loop iteration BEFORE dispatching anything slow, so a crash mid-loop doesn't double-remind on the next tick.

### Step 5 — Schedule both in `routes/console.php`

```php
use Illuminate\Support\Facades\Schedule;
Schedule::command('automations:run-time-based')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('tasks:send-reminders')->everyFifteenMinutes()->withoutOverlapping();
```

### Step 6 — Frontend

`AutomationsPage.jsx`: add `time_in_stage: 'ליד שוהה בשלב X מעל N ימים'` to `TRIGGER_LABELS`; when this trigger is selected, show two extra inputs (stage select from `usePipeline()`, days number input) that write the two condition entries from Step 2. Everything else (actions UI) reused untouched.

### Step 7 — Tests

Extend `backend/tests/Feature/AutomationTest.php`:
- time_in_stage automation + lead older than N days in stage → `artisan('automations:run-time-based')` → assert `automation_time_fires` row exists and the action ran (e.g. `create_activity` action → Activity row exists).
- Run the command TWICE → still exactly one fire row, one activity (idempotency).
- Lead updated 1 day ago with 7-day threshold → no fire.
- Task due in 2h → `tasks:send-reminders` → `reminded_at` set; second run → no duplicate.

## Edge cases a weaker model would miss

1. **`dispatchAfterResponse` in console = sync execution** — the existing AutomationEngine call-path habit is wrong for commands. Use `dispatch()`.
2. **Idempotency must be the DB unique key, not application logic** — `insertOrIgnore` + UNIQUE(automation_id, entity_type, entity_id) survives overlapping ticks and worker crashes. Checking `AutomationLog` instead is tempting but wrong: logs are also written by event-triggered runs of the same automation type and by retries.
3. **Timezone**: `now()` is UTC (check `config/app.php` timezone). "7 days" comparisons are duration-based so UTC is fine; but if you later add "remind at 9:00", that needs tenant TZ — out of scope, leave a comment.
4. **Global scope trap**: `Automation`, `Lead`, `Task` all have a tenant global scope that reads `app('current_tenant_id')` — in a command that binding doesn't exist until you set it. Any query BEFORE `app()->instance(...)` must use `withoutGlobalScope('tenant')` explicitly or it will throw/return empty. Follow RunAutomationJob.php:37-40 as the reference pattern.
5. **Windows dev has no cron**: the scheduler only ticks if `php artisan schedule:work` runs as a fourth always-on process (MySQL, serve, queue:work, schedule:work). Update HANDOFF §2 or imports/reminders will "mysteriously" never fire in dev.
6. **Stale queue worker** (HANDOFF §8): after deploying these jobs, restart `queue:work` or the old worker will fail unserializing new job classes.
7. **A lead deleted (soft-delete) between selection and job execution**: RunAutomationJob already handles it (`find` returns null → return). No action needed — but don't "improve" that guard away.
8. **`insertOrIgnore` on sqlite** (test env) works, but the fire-row must include `fired_at` explicitly — no DB default in Laravel's `timestamp` unless set; set `now()` in the insert array.

## Acceptance criteria

1. `php artisan automations:run-time-based` on dev DB with a 7-day/stage-X automation fires exactly once per matching lead; re-running produces zero new activities. Show SQL count of `automation_time_fires` before/after.
2. New automation type creatable end-to-end from the browser UI, appears with correct Hebrew label.
3. `php artisan tasks:send-reminders` sets `reminded_at` on a due task and creates the lead activity; rerun = no-op.
4. `php artisan schedule:list` shows both commands with correct cadence.
5. `php artisan test` — all existing 142 + new tests pass.
6. SCHEMA_DB contains both new SQL mirrors; `ALTER` uses `IF NOT EXISTS`.
