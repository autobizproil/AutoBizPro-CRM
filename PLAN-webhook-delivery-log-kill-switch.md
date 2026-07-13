# PLAN — Outgoing Webhook Delivery Log + Kill Switch (+ delivery_id retry bug)

## Goal

Three tightly-coupled items that complete AGENT_ROADMAP Phase 1's "observability from day one" and pre-build the Phase 3 kill switch:

1. **Fix a real idempotency bug**: `SendOutgoingWebhook` generates `delivery_id` inside `handle()` — every queue retry mints a NEW uuid, so the documented consumer contract ("dedupe on delivery_id, deliveries can repeat") is broken. A retried delivery is indistinguishable from a new event.
2. **Persist a delivery log** (`webhook_deliveries` table) — today the only trace of a failed webhook is a `Log::warning` line; the roadmap exit criterion "zero silent drops (dead-letter counts reconcile)" is unverifiable.
3. **Kill switch** — one tenant setting (`outgoing_webhooks_paused`) that instantly stops all outgoing deliveries, checked in the job, toggleable in Settings UI.

## Current reality (verified 2026-07-12)

- `backend/app/Jobs/SendOutgoingWebhook.php` — `$tries=3, $timeout=15`; uuid minted at line 43 inside `handle()`; HMAC `X-Webhook-Signature: sha256=...` over raw body when `outgoing_webhook_secret` set; throws on HTTP client exception to trigger retry. **Note: a 4xx/5xx response does NOT throw (no `->throw()` call) — only connection-level failures retry. Decide deliberately (Step 3).**
- `backend/app/Observers/LeadObserver.php` — dispatch gate (skips when no URL configured). Events: `lead_created`, `status_changed`, `stage_changed`, `lead_updated`.
- `backend/app/Services/SettingsService.php` — simple key/value on `tenant_settings`; `get`/`set`.
- Settings UI lives in `frontend/src/pages/settings/SettingsPage.jsx` (1402 lines; outgoing-webhook URL/secret UI added in commit 96970ae8 — grep `outgoing_webhook` there to find the section).
- Tests: `backend/tests/Feature/OutgoingWebhookSignatureTest.php` and `LeadWebhookCoverageTest.php` exist — mirror their patterns (`Http::fake`, `Queue::fake`).

## Files to touch

1. `backend/database/migrations/2026_07_12_000003_create_webhook_deliveries_table.php` — NEW (+ `SCHEMA_DB/2026_07_12_000003_create_webhook_deliveries_table.sql` mirror — project law)
2. `backend/app/Models/WebhookDelivery.php` — NEW
3. `backend/app/Jobs/SendOutgoingWebhook.php` — rework
4. `backend/app/Observers/LeadObserver.php` — kill-switch check (cheap, before dispatch)
5. `backend/routes/api.php` — `GET /settings/webhook-deliveries` route
6. `backend/app/Http/Controllers/SettingsController.php` — deliveries list action; pause toggle rides the existing tenant-settings update path (verify `updateTenant`/settings PUT whitelists keys — if there's a whitelist, add `outgoing_webhooks_paused`)
7. `frontend/src/pages/settings/SettingsPage.jsx` — pause toggle + last-deliveries table in the existing webhook section
8. `backend/tests/Feature/OutgoingWebhookSignatureTest.php` — extend (or new `WebhookDeliveryLogTest.php`)

## Implementation order

### Step 1 — Migration

```sql
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    delivery_id CHAR(36) NOT NULL,
    event VARCHAR(32) NOT NULL,
    lead_id BIGINT UNSIGNED NULL,
    url VARCHAR(2048) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending | success | failed
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    response_code SMALLINT UNSIGNED NULL,
    error TEXT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY wd_delivery_unique (delivery_id),
    KEY wd_tenant_created_idx (tenant_id, created_at)
);
```

Do NOT store the full payload (leads contain PII; the log is for delivery forensics, not replay — keep it lean). `lead_id` without FK constraint: leads soft-delete, and the log must outlive them.

### Step 2 — Fix delivery_id + write the log in SendOutgoingWebhook

- Add `private string $deliveryId` set in `__construct` (`(string) Str::uuid()`). **Constructor properties survive retries because the job is serialized once at dispatch — this is exactly why the fix works.**
- In `handle()`: upsert the `WebhookDelivery` row by `delivery_id` (first attempt creates with `pending`; every attempt increments `attempts` — use `$this->attempts()` from `InteractsWithQueue`).
- On response: record `response_code`. Success (2xx) → `status='success'`. Non-2xx → `status='failed'`, store body snippet in `error` (truncate 500 chars), and **now decide retry policy: call `->throw()` on 5xx only** (4xx = consumer bug, retrying won't help; 5xx/timeouts = transient). This changes current behavior deliberately — today non-2xx is silently "sent".
- Add a `failed(\Throwable $e)` method to the job: mark the row `failed` with the exception message — this catches the final-retry-exhausted case that `handle()` never sees.

### Step 3 — Kill switch

- `LeadObserver::dispatch()`: after the existing URL check, add `if ($settings->get('outgoing_webhooks_paused')) return;`. **Observer runs in HTTP context where `current_tenant_id` is bound — but ALSO in queue/import context (`ProcessImportJob` creates leads). SettingsService reads `TenantSetting` which is tenant-scoped; verify TenantSetting's scope resolves in import context (ProcessImportJob binds current_tenant_id — confirm by reading it). If any path lacks the binding, guard with `app()->has('current_tenant_id')`.**
- Belt-and-braces: check it again at the top of `SendOutgoingWebhook::handle()` (jobs already queued when the switch flips should also stop; the job re-binds tenant at line 29, so the setting read works there).
- Settings PUT path: find how `outgoing_webhook_url` is saved (grep `outgoing_webhook` in `SettingsController.php`) and add `outgoing_webhooks_paused` the same way (store `'1'`/`''` — TenantSetting values are strings; treat truthy accordingly).

### Step 4 — Deliveries list endpoint + UI

- `GET /api/settings/webhook-deliveries` → last 50 rows for tenant, `->middleware('permission:users,can_update')` (same gate as other webhook settings).
- SettingsPage webhook section: toggle switch "השהה שליחת webhooks" + table (event, status color-dot, attempts, response_code, created_at, error tooltip). Match existing SettingsPage styling (dark-mode classes — copy from adjacent tables).

### Step 5 — Tests

- Dispatch job twice via retry simulation → same `delivery_id` in both `Http::fake` captured requests' `X-Delivery-Id` header.
- 500 response → row `failed`, attempts incremented, exception thrown (retry path); 404 response → row `failed`, NO exception (no retry); 200 → `success`.
- Kill switch on → `Queue::fake` asserts nothing dispatched from observer; already-queued job with switch on → `Http::fake` asserts zero requests.
- Signature test still passes (body unchanged — signature covers raw body which never included delivery row data).

## Edge cases a weaker model would miss

1. **The retry-regenerated delivery_id bug is invisible in tests that run the job once.** You must simulate `release()`/re-handle or call `handle()` twice on the same instance to prove the header is stable.
2. **`SerializesModels` on the Lead property**: the payload is built from the lead AT HANDLE TIME (re-fetched by SerializesModels), not dispatch time — a lead edited between dispatch and send delivers current data under an old event name. Known quirk; log row's `event` keeps the original event. Leave as-is, comment it.
3. **A deleted lead breaks the job**: `SerializesModels` throws `ModelNotFoundException` on unserialize if the lead was hard-deleted. Leads soft-delete, and soft-deleted models FAIL default re-hydration unless the trait's `restoreModel` uses `withTrashed` — Laravel does include trashed for SerializesModels by default (`useModelRestorer`)… actually behavior differs by version: **test it** — dispatch, soft-delete the lead, run worker; if it throws, catch in `failed()` gracefully.
4. **tenant_settings value column type**: `SettingsService` stores whatever it gets; JSON casts may apply (labels stored as array — see `labels()` merging `get('labels', [])`). Check `TenantSetting` model casts before assuming string round-trip for the paused flag.
5. **Don't add FK on `webhook_deliveries.lead_id`** (soft-deleted/pruned leads must not block or cascade the log).
6. **Log growth**: add `Schedule`d prune later; for now add an index-friendly `created_at` and note pruning in a comment. Do NOT build pruning now (scope).
7. **Restart the queue worker after deploying** (HANDOFF §8) — old worker code has no constructor `deliveryId` and will error on new jobs.

## Acceptance criteria

1. Trigger a lead update with webhook URL set (use webhook.site or `Http::fake` in a tinker check) → `webhook_deliveries` row `success`, `X-Delivery-Id` header equals row's `delivery_id`.
2. Point URL at a 500-returning endpoint → row shows `attempts=3`, `status='failed'`, response_code 500.
3. Toggle pause in Settings UI → subsequent lead edits create NO deliveries rows and NO HTTP calls; toggle off → flow resumes. Verified in browser.
4. `php artisan test` — all green including new tests.
5. SCHEMA_DB mirror file exists for the migration.
