# Facebook Lead Ads via Make.com Bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let leads flow from a customer's Facebook Page into their CRM tenant via a Make.com
scenario, bypassing Meta's currently-blocked direct-OAuth permission chain entirely.

**Architecture:** One new public webhook endpoint (`POST /api/integrations/make/lead/{tenant}`)
that Make's HTTP module calls after its own "Watch Leads" trigger resolves a lead's fields. Auth is
a per-tenant shared secret compared with `hash_equals`, generated server-side (never typed by an
admin) via a new protected endpoint and stored in the existing `tenant_settings` key/value table.
Lead creation goes through the plain `Lead::create(...)` + `LeadObserver` pipeline — identical to
every other integration webhook in this codebase (Facebook direct, Voicenter, WhatsApp) — so
automations, the outgoing webhook, and reporting all see this lead exactly like any other.

**Tech Stack:** Laravel 12 (PHP 8.2), existing `TenantSetting`/`SettingsService` key-value store,
PHPUnit feature tests with `RefreshDatabase`.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-08-13-make-facebook-lead-bridge-design.md` — read it
  before starting; this plan implements it section by section, including the "Secret generation"
  addendum.
- No DB migration needed. `make_lead_webhook_secret` is a new key in the existing `tenant_settings`
  table, same mechanism as `voicenter_webhook_secret`.
- The public ingestion endpoint must NOT require `auth:sanctum` — Make's HTTP module has no session,
  same as `facebookWebhook`/`voicenterWebhook`/`whatsappWebhook`.
- The secret-generation endpoint MUST require `auth:sanctum` + `permission:users,can_update` — same
  gate as the existing `/integrations/settings` routes.
- `make_lead_webhook_secret` must be added to `IntegrationsController::INTEGRATION_KEYS` (so it's
  visible, masked, via `getSettings`) and excluded from `saveSettings`' manual-write path (same
  pattern as `facebook_page_access_token` — generate-only, never hand-typed).
- Follow existing code style: all new logic lives in `IntegrationsController` (this codebase keeps
  every integration webhook/settings method in this one controller — see Facebook/Voicenter/Paycall
  sections already there), Hebrew user-facing strings where the codebase already uses them, tenant
  resolved via `Tenant::where('subdomain', $tenant)->first()` + `app()->instance('current_tenant_id', ...)`.
- Tests use the established pattern from `backend/tests/Feature/FacebookLeadAdsTest.php`:
  `RefreshDatabase`, a private `tenantWithSettings()` helper building a `Tenant` + `TenantSetting`
  rows, `app()->instance('current_tenant_id', ...)`, `$this->postJson(...)`.

---

### Task 1: Secret generation endpoint

**Files:**
- Modify: `backend/app/Http/Controllers/IntegrationsController.php:26-56` (whitelist),
  `:82-99` (`saveSettings` guard), add new method near the end of the class (after
  `googleSheetsExport`, before the closing `}` — currently around line 674)
- Modify: `backend/routes/api.php` (new protected route, inside the
  `Route::middleware(['auth:sanctum', 'tenant', 'agent.ability'])` group, near the existing
  Facebook OAuth redirect route around line 200-201)
- Test: `backend/tests/Feature/MakeWebhookSecretTest.php`

**Interfaces:**
- Produces: `IntegrationsController::generateMakeWebhookSecret(): JsonResponse`, route
  `POST /api/integrations/make-webhook-secret/generate`. Response shape:
  `{ success: true, data: { secret: string } }` (64 hex chars). Consumed by Task 2's tests only
  indirectly (Task 2 writes its own secret directly into `TenantSetting` — it doesn't call this
  endpoint) and by the frontend/autobizpro operator during real onboarding (out of scope for this
  plan — no UI is built here, this is a backend-only API for now, called manually via `curl`/Tinker
  or a future admin button).
- `make_lead_webhook_secret` becomes a valid, masked key returned by the existing
  `GET /api/integrations/settings` endpoint.

- [ ] **Step 1: Write the failing test for the whitelist + masking**

Create `backend/tests/Feature/MakeWebhookSecretTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MakeWebhookSecretTest extends TestCase
{
    use RefreshDatabase;

    private function tenantAdmin(): array
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Admin',
            'email'     => 'admin@acme.test',
            'password'  => bcrypt('x'),
            'role'      => 'admin',
        ]);
        return [$tenant, $user];
    }

    public function test_generate_creates_a_64_char_hex_secret_and_returns_it_once(): void
    {
        [, $user] = $this->tenantAdmin();

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/integrations/make-webhook-secret/generate')
            ->assertOk()
            ->assertJson(['success' => true]);

        $secret = $response->json('data.secret');
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $secret);

        $stored = TenantSetting::where('key', 'make_lead_webhook_secret')->first();
        $this->assertSame($secret, $stored->value);
    }

    public function test_regenerating_rotates_the_secret(): void
    {
        [, $user] = $this->tenantAdmin();

        $first = $this->actingAs($user, 'sanctum')
            ->postJson('/api/integrations/make-webhook-secret/generate')
            ->json('data.secret');

        $second = $this->actingAs($user, 'sanctum')
            ->postJson('/api/integrations/make-webhook-secret/generate')
            ->json('data.secret');

        $this->assertNotSame($first, $second);
    }

    public function test_get_settings_returns_secret_masked(): void
    {
        [, $user] = $this->tenantAdmin();

        $this->actingAs($user, 'sanctum')->postJson('/api/integrations/make-webhook-secret/generate');

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/integrations/settings')
            ->assertOk();

        $masked = $response->json('data.make_lead_webhook_secret');
        $this->assertStringStartsWith('****', $masked);
        $this->assertSame(4, strlen($masked) - 4);
    }

    public function test_manual_write_via_save_settings_is_ignored(): void
    {
        [, $user] = $this->tenantAdmin();

        $this->actingAs($user, 'sanctum')
            ->putJson('/api/integrations/settings', ['make_lead_webhook_secret' => 'hand-typed-value'])
            ->assertOk();

        $this->assertNull(TenantSetting::where('key', 'make_lead_webhook_secret')->first());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=MakeWebhookSecretTest`
Expected: FAIL — route `/api/integrations/make-webhook-secret/generate` doesn't exist (404), and
`make_lead_webhook_secret` isn't in `INTEGRATION_KEYS` yet.

- [ ] **Step 3: Add the key to the whitelist**

In `backend/app/Http/Controllers/IntegrationsController.php`, inside `INTEGRATION_KEYS` (the array
starting at line 26), add after the `'outgoing_webhook_url',` line:

```php
        // Facebook Lead Ads via Make.com bridge — server-generated, never hand-typed
        // (see saveSettings' guard below). Compared against X-Webhook-Secret on the
        // public ingestion endpoint.
        'make_lead_webhook_secret',
```

- [ ] **Step 4: Guard it out of `saveSettings`' manual-write path**

In the same file, in `saveSettings()` (currently lines 82-99), change:

```php
            if ($k === 'facebook_page_access_token') {
                continue; // OAuth-only — never accepted from a manual request
            }
```

to:

```php
            if ($k === 'facebook_page_access_token' || $k === 'make_lead_webhook_secret') {
                continue; // generated server-side only — never accepted from a manual request
            }
```

- [ ] **Step 5: Add the generation endpoint**

In the same file, add this method after `googleSheetsExport` (the last method in the class, right
before the final closing `}`):

```php
    // =====================================================================
    //  Facebook Lead Ads via Make.com bridge
    // =====================================================================

    /**
     * Generate (or rotate) the per-tenant shared secret Make's HTTP module sends
     * as X-Webhook-Secret on the public ingestion endpoint below. Returned in full
     * exactly once — every subsequent read via getSettings() comes back masked.
     *
     * POST /api/integrations/make-webhook-secret/generate
     */
    public function generateMakeWebhookSecret(): JsonResponse
    {
        $secret = bin2hex(random_bytes(32)); // 64 hex chars — same pattern as PdfController's signing tokens
        app(SettingsService::class)->set('make_lead_webhook_secret', $secret);

        return response()->json(['success' => true, 'data' => ['secret' => $secret]]);
    }
```

- [ ] **Step 6: Add the route**

In `backend/routes/api.php`, inside the `auth:sanctum` group, add right after the Facebook OAuth
redirect route (after the line `->middleware('permission:users,can_update');` that follows
`/integrations/facebook/oauth/redirect`):

```php
    // Facebook Lead Ads via Make.com bridge — generates the per-tenant secret Make's
    // HTTP module authenticates with against the public endpoint below.
    Route::post('/integrations/make-webhook-secret/generate', [IntegrationsController::class, 'generateMakeWebhookSecret'])
        ->middleware('permission:users,can_update');
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=MakeWebhookSecretTest`
Expected: PASS, 4 tests.

- [ ] **Step 8: Commit**

```bash
git add backend/app/Http/Controllers/IntegrationsController.php backend/routes/api.php backend/tests/Feature/MakeWebhookSecretTest.php
git commit -m "feat: server-generated per-tenant secret for Make.com lead bridge"
```

---

### Task 2: Public lead ingestion endpoint

**Files:**
- Modify: `backend/app/Http/Controllers/IntegrationsController.php` (new method, added right after
  `generateMakeWebhookSecret` from Task 1)
- Modify: `backend/routes/api.php` (new public route, in the public-routes block near the other
  webhook routes, e.g. right after the Voicenter webhook route around line 60-61)
- Test: `backend/tests/Feature/MakeLeadBridgeTest.php`

**Interfaces:**
- Consumes: `SettingsService::get('make_lead_webhook_secret')` (Task 1 established this key; in
  tests here it's written directly via `TenantSetting::create(...)`, not through Task 1's endpoint).
- Produces: `IntegrationsController::makeLeadWebhook(Request $request, string $tenant): JsonResponse`,
  route `POST /api/integrations/make/lead/{tenant}`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/Feature/MakeLeadBridgeTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Automation;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\TenantSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use App\Jobs\RunAutomationJob;
use Tests\TestCase;

class MakeLeadBridgeTest extends TestCase
{
    use RefreshDatabase;

    private function tenantWithSecret(string $secret = 'test-secret-abc'): Tenant
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        TenantSetting::create(['key' => 'make_lead_webhook_secret', 'value' => $secret, 'tenant_id' => $tenant->id]);
        return $tenant;
    }

    public function test_valid_payload_creates_lead_with_make_source(): void
    {
        $tenant = $this->tenantWithSecret();

        $this->postJson('/api/integrations/make/lead/acme', [
            'name'      => 'דני כהן',
            'phone'     => '0541234567',
            'email'     => 'dani@example.com',
            'form_name' => 'טופס ליד ראשי',
        ], ['X-Webhook-Secret' => 'test-secret-abc'])
            ->assertOk()
            ->assertJson(['success' => true]);

        $lead = Lead::where('phone', '0541234567')->first();
        $this->assertNotNull($lead);
        $this->assertSame($tenant->id, $lead->tenant_id);
        $this->assertSame('דני כהן', $lead->name);
        $this->assertSame('dani@example.com', $lead->email);
        $this->assertSame('פייסבוק (Make)', $lead->source);
        $this->assertSame('Form: טופס ליד ראשי', $lead->notes);
        $this->assertSame(1, Lead::count());
    }

    public function test_wrong_secret_is_rejected(): void
    {
        $this->tenantWithSecret();

        $this->postJson('/api/integrations/make/lead/acme', [
            'name' => 'X', 'phone' => '0500000000', 'email' => null,
        ], ['X-Webhook-Secret' => 'wrong-secret'])
            ->assertStatus(403);

        $this->assertSame(0, Lead::count());
    }

    public function test_missing_secret_header_is_rejected(): void
    {
        $this->tenantWithSecret();

        $this->postJson('/api/integrations/make/lead/acme', [
            'name' => 'X', 'phone' => '0500000000',
        ])->assertStatus(403);

        $this->assertSame(0, Lead::count());
    }

    public function test_unknown_tenant_returns_404(): void
    {
        $this->postJson('/api/integrations/make/lead/does-not-exist', [
            'name' => 'X', 'phone' => '0500000000',
        ], ['X-Webhook-Secret' => 'anything'])
            ->assertStatus(404);
    }

    public function test_missing_all_contact_fields_returns_422(): void
    {
        $this->tenantWithSecret();

        $this->postJson('/api/integrations/make/lead/acme', [
            'form_name' => 'טופס בלי פרטי קשר',
        ], ['X-Webhook-Secret' => 'test-secret-abc'])
            ->assertStatus(422);

        $this->assertSame(0, Lead::count());
    }

    public function test_no_secret_configured_for_tenant_rejects_every_request(): void
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        // No make_lead_webhook_secret setting stored at all.

        $this->postJson('/api/integrations/make/lead/acme', [
            'name' => 'X', 'phone' => '0500000000',
        ], ['X-Webhook-Secret' => ''])
            ->assertStatus(403);

        $this->assertSame(0, Lead::count());
    }

    public function test_lead_created_automation_fires_through_this_path(): void
    {
        Bus::fake();
        $tenant = $this->tenantWithSecret();

        Automation::create([
            'tenant_id'    => $tenant->id,
            'name'         => 'Welcome',
            'trigger_type' => 'lead_created',
            'conditions'   => [],
            'actions'      => [['type' => 'send_email']],
            'active'       => true,
        ]);

        $this->postJson('/api/integrations/make/lead/acme', [
            'name' => 'דני כהן', 'phone' => '0541234567',
        ], ['X-Webhook-Secret' => 'test-secret-abc'])->assertOk();

        Bus::assertDispatchedAfterResponse(RunAutomationJob::class);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=MakeLeadBridgeTest`
Expected: FAIL — route `/api/integrations/make/lead/{tenant}` doesn't exist (404 on every case,
including the ones expecting 403/422).

- [ ] **Step 3: Add the controller method**

In `backend/app/Http/Controllers/IntegrationsController.php`, add this method right after
`generateMakeWebhookSecret` (from Task 1):

```php
    /**
     * Public ingestion endpoint for the Make.com Facebook Lead Ads bridge. Make's
     * "Watch Leads" module already resolved the lead's fields — no Graph API call
     * happens here. Auth is a per-tenant shared secret (X-Webhook-Secret), generated
     * via generateMakeWebhookSecret() above, compared with hash_equals.
     *
     * POST /api/integrations/make/lead/{tenant}
     * Body: { name?, phone?, email?, form_name? } — at least one of name/phone/email required.
     */
    public function makeLeadWebhook(Request $request, string $tenant): JsonResponse
    {
        $tenantModel = Tenant::where('subdomain', $tenant)->first();
        if (!$tenantModel) {
            return response()->json(['success' => false], 404);
        }
        app()->instance('current_tenant_id', $tenantModel->id);

        $secret = app(SettingsService::class)->get('make_lead_webhook_secret');
        $provided = $request->header('X-Webhook-Secret', '');
        if (!$secret || !hash_equals($secret, $provided)) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $data = $request->validate([
            'name'      => 'nullable|string|max:255',
            'phone'     => 'nullable|string|max:50',
            'email'     => 'nullable|email|max:255',
            'form_name' => 'nullable|string|max:255',
        ]);

        if (empty($data['name']) && empty($data['phone']) && empty($data['email'])) {
            return response()->json(['success' => false, 'message' => 'name, phone, or email is required'], 422);
        }

        Lead::create([
            'tenant_id' => $tenantModel->id,
            'name'      => $data['name'] ?: 'Facebook Lead',
            'phone'     => $data['phone'] ?? null,
            'email'     => $data['email'] ?? null,
            'source'    => 'פייסבוק (Make)',
            'status'    => 'NEW_LEAD',
            'notes'     => !empty($data['form_name']) ? "Form: {$data['form_name']}" : null,
        ]);

        return response()->json(['success' => true]);
    }
```

- [ ] **Step 4: Add the route**

In `backend/routes/api.php`, in the public routes block (no `auth:sanctum`), add right after the
Voicenter webhook route:

```php
// Facebook Lead Ads via Make.com bridge — public, authenticated via per-tenant
// X-Webhook-Secret header instead of a session (Make's HTTP module has no session).
Route::post('/integrations/make/lead/{tenant}', [IntegrationsController::class, 'makeLeadWebhook'])
    ->middleware('throttle:120,1');
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=MakeLeadBridgeTest`
Expected: PASS, 7 tests.

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: PASS, all tests (no regressions in existing Facebook/Voicenter/Automation suites).

- [ ] **Step 7: Commit**

```bash
git add backend/app/Http/Controllers/IntegrationsController.php backend/routes/api.php backend/tests/Feature/MakeLeadBridgeTest.php
git commit -m "feat: public lead ingestion endpoint for Make.com Facebook Lead Ads bridge"
```

---

## Out of scope (per spec's Non-goals)

- No frontend UI for triggering secret generation or displaying it — Task 1's endpoint is called
  manually (curl/Tinker) by whoever sets up a customer's Make scenario, for now.
- No self-serve customer onboarding, no migration path off Make once direct OAuth unblocks, no
  multi-page-per-scenario support — all explicitly deferred in the spec.
