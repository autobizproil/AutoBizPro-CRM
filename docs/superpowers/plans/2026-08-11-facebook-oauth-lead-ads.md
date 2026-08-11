# Facebook Lead Ads OAuth Connect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual app_id/app_secret/verify_token/page_id entry form with a one-click
"Connect with Facebook" OAuth flow that also performs the Page→App webhook subscription
(`POST /{page-id}/subscribed_apps`) that today has no working manual UI path.

**Architecture:** A global Meta App (one set of credentials for the whole install, in `.env`) is
used via Laravel Socialite to run a standard OAuth code exchange. The callback exchanges the
short-lived user token for a long-lived one, lists the Pages the user manages via Graph API, and —
for the chosen Page — persists its ID, name, and page access token per-tenant, then calls
`subscribed_apps` so `leadgen` webhooks start flowing. `FacebookLeadAdsService::fetchLead` switches
from an app token to the stored page token so it can read a customer's own leads.

**Tech Stack:** Laravel 12 (PHP 8.2), Laravel Socialite (Facebook driver), existing
`TenantSetting`/`SettingsService` key-value store, React + Vite frontend (no component test
framework in this repo — verify UI changes manually, per existing convention).

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-08-11-facebook-oauth-lead-ads-design.md` — read it before
  starting; this plan implements it section by section.
- No DB migration needed. Everything lives in the existing `tenant_settings` key/value table.
- `facebook_app_id`, `facebook_app_secret`, `facebook_verify_token` move from per-tenant settings to
  global `.env` — remove them from `IntegrationsController::INTEGRATION_KEYS`.
- `facebook_page_access_token` must be rejected by `saveSettings` if a caller tries to set it by
  hand — only the OAuth callback may write it.
- Page access tokens must be the **long-lived** exchange result, never the short-lived token
  Socialite returns first (this was flagged as the highest risk in the design doc).
- All new backend routes live inside the existing
  `Route::middleware(['auth:sanctum', 'tenant', 'agent.ability'])` group in
  `backend/routes/api.php`, gated with `permission:users,can_update` — same as the existing
  `/integrations/settings` routes.
- Follow existing code style: services are plain classes constructor-injected with `SettingsService`
  (see `FacebookLeadAdsService`), controllers stay thin, Hebrew user-facing error strings.
- Tests use the `Http::fake()` pattern already established in
  `backend/tests/Feature/FacebookLeadAdsTest.php` and `WhatsappIntegrationTest.php`
  (`RefreshDatabase`, a `tenantUser()`/`tenantWithSettings()` helper creating a `Tenant` + `User` +
  `TenantSetting` rows, `app()->instance('current_tenant_id', ...)`).

---

### Task 1: Install Socialite, add config, lock down settings whitelist

**Files:**
- Modify: `backend/composer.json` (via `composer require laravel/socialite`)
- Modify: `backend/config/services.php`
- Modify: `backend/.env.example`
- Modify: `backend/app/Http/Controllers/IntegrationsController.php:26-54` (whitelist), `:80-94`
  (`saveSettings`)
- Test: `backend/tests/Feature/FacebookOAuthSettingsTest.php`

**Interfaces:**
- Produces: `config('services.facebook.client_id')`, `client_secret`, `redirect` — read by Task 2's
  `FacebookOAuthService`. `IntegrationsController::INTEGRATION_KEYS` gains
  `facebook_page_access_token`, `facebook_page_name`; loses `facebook_app_id`,
  `facebook_app_secret`, `facebook_verify_token`.

- [ ] **Step 1: Install Socialite**

Run: `cd backend && composer require laravel/socialite`
Expected: `composer.json` gains `"laravel/socialite": "^5.x"` under `require`.

- [ ] **Step 2: Add Facebook service config**

Add to `backend/config/services.php`, inside the returned array, after `'webhook'`:

```php
    'facebook' => [
        'client_id'     => env('FACEBOOK_APP_ID'),
        'client_secret' => env('FACEBOOK_APP_SECRET'),
        'redirect'      => env('FACEBOOK_REDIRECT_URI'),
    ],
```

- [ ] **Step 3: Document the new env keys**

Add to `backend/.env.example`, after the `WEBHOOK_TARGET_URL` line (or at the end if that line
doesn't exist):

```
# Facebook Lead Ads OAuth — one Meta App for the whole install
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_REDIRECT_URI=http://localhost/api/integrations/facebook/oauth/callback
```

- [ ] **Step 4: Write the failing test for the whitelist + guard**

Create `backend/tests/Feature/FacebookOAuthSettingsTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FacebookOAuthSettingsTest extends TestCase
{
    use RefreshDatabase;

    private function tenantAdmin(): array
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create(['tenant_id' => $tenant->id, 'name' => 'Admin', 'email' => 'admin@acme.test', 'password' => bcrypt('x'), 'role' => 'admin']);
        return [$tenant, $user];
    }

    public function test_manual_app_credentials_are_no_longer_accepted(): void
    {
        [, $user] = $this->tenantAdmin();

        $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->putJson('/api/integrations/settings', [
                'facebook_app_id' => 'hand-typed-id',
                'facebook_app_secret' => 'hand-typed-secret',
                'facebook_verify_token' => 'hand-typed-token',
            ])
            ->assertOk();

        $this->assertNull(TenantSetting::where('key', 'facebook_app_id')->first());
        $this->assertNull(TenantSetting::where('key', 'facebook_app_secret')->first());
        $this->assertNull(TenantSetting::where('key', 'facebook_verify_token')->first());
    }

    public function test_page_access_token_cannot_be_set_by_hand(): void
    {
        [, $user] = $this->tenantAdmin();

        $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->putJson('/api/integrations/settings', [
                'facebook_page_access_token' => 'attacker-supplied-token',
            ])
            ->assertOk();

        $this->assertNull(TenantSetting::where('key', 'facebook_page_access_token')->first());
    }

    public function test_page_name_and_id_are_readable_after_oauth_writes_them(): void
    {
        [$tenant, $user] = $this->tenantAdmin();
        TenantSetting::create(['key' => 'facebook_page_id', 'value' => '123456', 'tenant_id' => $tenant->id]);
        TenantSetting::create(['key' => 'facebook_page_name', 'value' => 'AutoBizPro IL', 'tenant_id' => $tenant->id]);

        $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->getJson('/api/integrations/settings')
            ->assertOk()
            ->assertJsonPath('data.facebook_page_id', '123456')
            ->assertJsonPath('data.facebook_page_name', 'AutoBizPro IL');
    }
}
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd backend && php artisan test --filter=FacebookOAuthSettingsTest`
Expected: FAIL — `facebook_app_id` etc. are still in the whitelist and get saved, and
`facebook_page_access_token`/`facebook_page_name` aren't recognized keys yet.

- [ ] **Step 6: Update the whitelist and add the write guard**

In `backend/app/Http/Controllers/IntegrationsController.php`, replace the Facebook block in
`INTEGRATION_KEYS` (currently lines 40-44):

```php
        // Facebook Lead Ads — app credentials live in config/services.php (global,
        // one Meta App for the whole install). Only the OAuth callback writes
        // facebook_page_access_token; see FacebookOAuthController.
        'facebook_page_id',
        'facebook_page_name',
        'facebook_page_access_token',
        'facebook_connection_status', // null | 'needs_renewal' — set by FacebookLeadAdsService::fetchLead, cleared by FacebookOAuthService::connectPage
```

In `saveSettings()`, add a guard right after the `foreach` opens (currently starts at line 82):

```php
    public function saveSettings(Request $request): JsonResponse
    {
        $settings = app(SettingsService::class);
        foreach (self::INTEGRATION_KEYS as $k) {
            if ($k === 'facebook_page_access_token') {
                continue; // OAuth-only — never accepted from a manual request
            }
            if ($request->has($k)) {
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend && php artisan test --filter=FacebookOAuthSettingsTest`
Expected: PASS — 3 tests.

- [ ] **Step 8: Run the existing Facebook webhook tests to confirm nothing broke**

Run: `cd backend && php artisan test --filter=FacebookLeadAdsTest`
Expected: PASS — these tests set `facebook_app_id`/`facebook_app_secret` via `TenantSetting::create`
directly (not through `saveSettings`), so removing them from the whitelist doesn't affect this test
file yet. It will be updated in Task 6.

- [ ] **Step 9: Commit**

```bash
git add backend/composer.json backend/composer.lock backend/config/services.php backend/.env.example backend/app/Http/Controllers/IntegrationsController.php backend/tests/Feature/FacebookOAuthSettingsTest.php
git commit -m "feat: move Facebook app credentials to global config, lock down page token writes"
```

---

### Task 2: `FacebookOAuthService::exchangeLongLivedToken`

**Files:**
- Create: `backend/app/Services/Integrations/FacebookOAuthService.php`
- Test: `backend/tests/Feature/FacebookOAuthServiceTest.php`

**Interfaces:**
- Consumes: `config('services.facebook.client_id')`, `client_secret` (Task 1).
- Produces: `FacebookOAuthService::exchangeLongLivedToken(string $shortLivedToken): string` — used by
  Task 6's `handleCallback`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/FacebookOAuthServiceTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Services\Integrations\FacebookOAuthService;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FacebookOAuthServiceTest extends TestCase
{
    use RefreshDatabase;

    private function service(): FacebookOAuthService
    {
        return new FacebookOAuthService(app(SettingsService::class));
    }

    public function test_exchange_long_lived_token_calls_graph_with_fb_exchange_token_grant(): void
    {
        config(['services.facebook.client_id' => 'app123', 'services.facebook.client_secret' => 'secret456']);

        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response([
                'access_token' => 'long-lived-token-abc',
                'token_type' => 'bearer',
                'expires_in' => 5183944,
            ], 200),
        ]);

        $result = $this->service()->exchangeLongLivedToken('short-lived-token-xyz');

        $this->assertSame('long-lived-token-abc', $result);
        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'oauth/access_token')
                && $request['grant_type'] === 'fb_exchange_token'
                && $request['client_id'] === 'app123'
                && $request['client_secret'] === 'secret456'
                && $request['fb_exchange_token'] === 'short-lived-token-xyz';
        });
    }

    public function test_exchange_long_lived_token_throws_on_graph_error(): void
    {
        config(['services.facebook.client_id' => 'app123', 'services.facebook.client_secret' => 'secret456']);

        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response(['error' => ['message' => 'bad token']], 400),
        ]);

        $this->expectException(\RuntimeException::class);
        $this->service()->exchangeLongLivedToken('bad-token');
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: FAIL — class `FacebookOAuthService` doesn't exist.

- [ ] **Step 3: Write the minimal implementation**

Create `backend/app/Services/Integrations/FacebookOAuthService.php`:

```php
<?php

namespace App\Services\Integrations;

use App\Services\SettingsService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Facebook Lead Ads — OAuth connect flow. Exchanges the code Socialite hands back
 * for a long-lived Page access token, lists the user's Pages, and subscribes the
 * chosen Page to our app's leadgen webhook (the step with no reliable manual UI —
 * see docs/superpowers/specs/2026-08-11-facebook-oauth-lead-ads-design.md).
 */
class FacebookOAuthService
{
    private SettingsService $settings;

    public function __construct(SettingsService $settings)
    {
        $this->settings = $settings;
    }

    /**
     * Exchange a short-lived user token (~1-2 hours) for a long-lived one (~60 days).
     * Page tokens derived from a long-lived user token don't expire on their own.
     */
    public function exchangeLongLivedToken(string $shortLivedToken): string
    {
        $response = Http::get('https://graph.facebook.com/v21.0/oauth/access_token', [
            'grant_type'        => 'fb_exchange_token',
            'client_id'         => config('services.facebook.client_id'),
            'client_secret'     => config('services.facebook.client_secret'),
            'fb_exchange_token' => $shortLivedToken,
        ]);

        if (!$response->ok() || !$response->json('access_token')) {
            Log::error('Facebook OAuth: long-lived token exchange failed', ['status' => $response->status(), 'body' => $response->body()]);
            throw new \RuntimeException('Facebook long-lived token exchange failed');
        }

        return $response->json('access_token');
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Integrations/FacebookOAuthService.php backend/tests/Feature/FacebookOAuthServiceTest.php
git commit -m "feat: add long-lived token exchange for Facebook OAuth"
```

---

### Task 3: `FacebookOAuthService::fetchPages`

**Files:**
- Modify: `backend/app/Services/Integrations/FacebookOAuthService.php`
- Modify: `backend/tests/Feature/FacebookOAuthServiceTest.php`

**Interfaces:**
- Produces: `FacebookOAuthService::fetchPages(string $userAccessToken): array` — each element shaped
  `['id' => string, 'name' => string, 'access_token' => string]`. Used by Task 6.

- [ ] **Step 1: Write the failing test**

Append to `FacebookOAuthServiceTest.php`:

```php
    public function test_fetch_pages_returns_id_name_and_page_token(): void
    {
        Http::fake([
            'graph.facebook.com/*/me/accounts*' => Http::response([
                'data' => [
                    ['id' => '111', 'name' => 'AutoBizPro IL', 'access_token' => 'page-token-111'],
                    ['id' => '222', 'name' => 'Other Page', 'access_token' => 'page-token-222'],
                ],
            ], 200),
        ]);

        $pages = $this->service()->fetchPages('user-token-abc');

        $this->assertCount(2, $pages);
        $this->assertSame(['id' => '111', 'name' => 'AutoBizPro IL', 'access_token' => 'page-token-111'], $pages[0]);
    }

    public function test_fetch_pages_returns_empty_array_when_user_manages_no_pages(): void
    {
        Http::fake(['graph.facebook.com/*/me/accounts*' => Http::response(['data' => []], 200)]);

        $this->assertSame([], $this->service()->fetchPages('user-token-abc'));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: FAIL — `fetchPages` doesn't exist.

- [ ] **Step 3: Write the minimal implementation**

Add to `FacebookOAuthService`, after `exchangeLongLivedToken`:

```php
    /**
     * Pages the authenticated user manages, each with its own page access token.
     * Returns [] rather than throwing when the user manages no Pages — the
     * caller decides how to report that to the user.
     */
    public function fetchPages(string $userAccessToken): array
    {
        $response = Http::get('https://graph.facebook.com/v21.0/me/accounts', [
            'access_token' => $userAccessToken,
            'fields'       => 'id,name,access_token',
        ]);

        if (!$response->ok()) {
            Log::error('Facebook OAuth: /me/accounts failed', ['status' => $response->status(), 'body' => $response->body()]);
            return [];
        }

        return array_map(
            fn (array $p) => ['id' => $p['id'], 'name' => $p['name'], 'access_token' => $p['access_token']],
            $response->json('data') ?? []
        );
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Integrations/FacebookOAuthService.php backend/tests/Feature/FacebookOAuthServiceTest.php
git commit -m "feat: list Facebook Pages the OAuth user manages"
```

---

### Task 4: `FacebookOAuthService::subscribePage`

**Files:**
- Modify: `backend/app/Services/Integrations/FacebookOAuthService.php`
- Modify: `backend/tests/Feature/FacebookOAuthServiceTest.php`

**Interfaces:**
- Produces: `FacebookOAuthService::subscribePage(string $pageId, string $pageAccessToken): bool` —
  `true` on success, `false` on failure (never throws — a failed subscription must not lose the
  saved connection, see design doc's error-handling table). Used by Task 5.

- [ ] **Step 1: Write the failing test**

Append to `FacebookOAuthServiceTest.php`:

```php
    public function test_subscribe_page_posts_leadgen_field_and_returns_true_on_success(): void
    {
        Http::fake(['graph.facebook.com/*/subscribed_apps*' => Http::response(['success' => true], 200)]);

        $result = $this->service()->subscribePage('111', 'page-token-111');

        $this->assertTrue($result);
        Http::assertSent(function ($request) {
            return str_contains($request->url(), '111/subscribed_apps')
                && $request->method() === 'POST'
                && $request['subscribed_fields'] === 'leadgen'
                && $request['access_token'] === 'page-token-111';
        });
    }

    public function test_subscribe_page_returns_false_without_throwing_on_failure(): void
    {
        Http::fake(['graph.facebook.com/*/subscribed_apps*' => Http::response(['error' => ['message' => 'denied']], 400)]);

        $this->assertFalse($this->service()->subscribePage('111', 'page-token-111'));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: FAIL — `subscribePage` doesn't exist.

- [ ] **Step 3: Write the minimal implementation**

Add to `FacebookOAuthService`, after `fetchPages`:

```php
    /**
     * Subscribe a Page to this app's leadgen webhook field. Without this call the
     * webhook endpoint can return 200 to Meta's own dashboard test yet still never
     * receive a real lead — the failure mode that motivated this whole flow.
     * Never throws: a failed subscription must not undo an otherwise-saved connection.
     */
    public function subscribePage(string $pageId, string $pageAccessToken): bool
    {
        $response = Http::asForm()->post("https://graph.facebook.com/v21.0/{$pageId}/subscribed_apps", [
            'subscribed_fields' => 'leadgen',
            'access_token'      => $pageAccessToken,
        ]);

        if (!$response->ok() || !$response->json('success')) {
            Log::error('Facebook OAuth: subscribed_apps failed', ['page_id' => $pageId, 'status' => $response->status(), 'body' => $response->body()]);
            return false;
        }

        return true;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Integrations/FacebookOAuthService.php backend/tests/Feature/FacebookOAuthServiceTest.php
git commit -m "feat: subscribe Facebook Page to leadgen webhook via subscribed_apps"
```

---

### Task 5: `FacebookOAuthService::connectPage` (persistence + orchestration)

**Files:**
- Modify: `backend/app/Services/Integrations/FacebookOAuthService.php`
- Modify: `backend/tests/Feature/FacebookOAuthServiceTest.php`

**Interfaces:**
- Consumes: `SettingsService::set()` (existing).
- Produces: `FacebookOAuthService::connectPage(array $page, int $tenantId): array` returning
  `['page_name' => string, 'subscribed' => bool]`. `$page` is one element from `fetchPages()`'s
  return shape. Used by Task 6.

- [ ] **Step 1: Write the failing test**

Append to `FacebookOAuthServiceTest.php`:

```php
    public function test_connect_page_persists_settings_and_subscribes(): void
    {
        $tenant = \App\Models\Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        Http::fake(['graph.facebook.com/*/subscribed_apps*' => Http::response(['success' => true], 200)]);

        $result = $this->service()->connectPage(['id' => '111', 'name' => 'AutoBizPro IL', 'access_token' => 'page-token-111'], $tenant->id);

        $this->assertSame(['page_name' => 'AutoBizPro IL', 'subscribed' => true], $result);
        $this->assertSame('111', $this->settings()->get('facebook_page_id'));
        $this->assertSame('AutoBizPro IL', $this->settings()->get('facebook_page_name'));
        $this->assertSame('page-token-111', $this->settings()->get('facebook_page_access_token'));
    }

    public function test_connect_page_saves_settings_even_when_subscribe_fails(): void
    {
        $tenant = \App\Models\Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        Http::fake(['graph.facebook.com/*/subscribed_apps*' => Http::response(['error' => ['message' => 'denied']], 400)]);

        $result = $this->service()->connectPage(['id' => '111', 'name' => 'AutoBizPro IL', 'access_token' => 'page-token-111'], $tenant->id);

        $this->assertSame(['page_name' => 'AutoBizPro IL', 'subscribed' => false], $result);
        $this->assertSame('111', $this->settings()->get('facebook_page_id'));
    }

    private function settings(): SettingsService
    {
        return app(SettingsService::class);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: FAIL — `connectPage` doesn't exist.

- [ ] **Step 3: Write the minimal implementation**

Add to `FacebookOAuthService`, after `subscribePage`:

```php
    /**
     * Persist the chosen Page's connection details for the current tenant and
     * attempt the webhook subscription. Always saves the connection, even if the
     * subscription call fails — the caller surfaces $result['subscribed'] === false
     * as a warning rather than losing the connection outright.
     */
    public function connectPage(array $page, int $tenantId): array
    {
        $this->settings->set('facebook_page_id', $page['id']);
        $this->settings->set('facebook_page_name', $page['name']);
        $this->settings->set('facebook_page_access_token', $page['access_token']);
        $this->settings->set('facebook_connection_status', null); // clear any prior needs_renewal flag

        $subscribed = $this->subscribePage($page['id'], $page['access_token']);

        return ['page_name' => $page['name'], 'subscribed' => $subscribed];
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Integrations/FacebookOAuthService.php backend/tests/Feature/FacebookOAuthServiceTest.php
git commit -m "feat: persist Facebook Page connection per tenant"
```

---

### Task 6: `FacebookOAuthController` — redirect, callback, selectPage + routes

> **Redesigned 2026-08-11 after task-level review.** The first version put all three endpoints
> behind `auth:sanctum` and used Laravel's session for Socialite's CSRF `state` check and for
> stashing the Page list between `callback` and `selectPage`. Review caught this before it merged:
> `callback` is the literal URL Facebook's browser redirects to after the user approves — a
> top-level, cross-origin navigation. Sanctum only attaches session support when a request's
> `Referer`/`Origin` matches the app's own frontend domains, and `facebook.com` never matches. So the
> original design would throw `Session store not set on request` (or 401 before the controller even
> ran) on every real callback — invisible in tests only because they mocked Socialite's `user()`
> call entirely, skipping the real state-validation code path that touches the session. See
> `docs/superpowers/specs/2026-08-11-facebook-oauth-lead-ads-design.md`'s "OAuth callback identity"
> addendum for the full writeup. The task below is the corrected version; ignore any earlier draft.

**Files:**
- Create: `backend/app/Http/Controllers/FacebookOAuthController.php`
- Modify: `backend/routes/api.php` — `redirect` inside the existing `auth:sanctum` group (same as
  before); `callback` and `selectPage` as new **public** routes (outside that group), placed near
  the other public integration webhooks (`/integrations/whatsapp/webhook/{tenant}`,
  `/integrations/facebook/webhook/{tenant}`) since they must be reachable without a session.
- Test: `backend/tests/Feature/FacebookOAuthControllerTest.php`

**The fix:** carry tenant identity through the OAuth round trip in a signed, encrypted `state` value
instead of the session (`Illuminate\Support\Facades\Crypt::encryptString`/`decryptString` — AES-256,
keyed by `APP_KEY`, tamper-proof, readable with no session at all). `redirect()` mints it while the
user is still on an authenticated, same-origin request — that part is genuinely safe behind
`auth:sanctum`. `callback()` and `selectPage()` decrypt it to recover the tenant and never touch
`auth:sanctum` or `$request->session()`. The multi-page case uses the same trick: instead of
stashing pages in session, `callback()` encrypts the candidate pages (including their access
tokens — safe, because the blob is opaque to the browser without `APP_KEY`) into a `pages_token` and
hands it to the frontend, which round-trips it unmodified in the `selectPage` POST. This is stronger
than the original design's "strip `access_token` from the JSON, trust the session to hold the real
data" — nothing sensitive is ever readable by the client, encrypted or not.

`callback()` also changes from returning JSON to returning a **redirect** to the frontend's Settings
page (`/settings?fb_status=...`), because it's now hit directly by a raw browser navigation, not
fetched by the SPA — returning JSON would show the user a blob of raw JSON instead of their app.
Task 8's frontend contract changes accordingly: it reads the outcome from `window.location.search`
on mount instead of calling `/oauth/callback` itself.

**Interfaces:**
- Consumes: `FacebookOAuthService::exchangeLongLivedToken`, `fetchPages`, `connectPage` (Tasks 2, 3,
  5); `Laravel\Socialite\Facades\Socialite` in `->stateless()` mode (no session dependency);
  `Illuminate\Support\Facades\Crypt`.
- Produces:
  - `GET /api/integrations/facebook/oauth/redirect` (authenticated, same-origin) → 302 to Facebook.
  - `GET /api/integrations/facebook/oauth/callback` (public, hit by Facebook's redirect) → 302 to
    `/settings?fb_status=connected&fb_page=<name>&fb_subscribed=1|0`, or
    `/settings?fb_status=choose_page&fb_pages_token=<token>&fb_pages=<json>`, or
    `/settings?fb_status=error&fb_message=<text>`.
  - `POST /api/integrations/facebook/oauth/select-page` (public, called by the SPA via fetch right
    after landing back on Settings) — body `{ pages_token, page_id }`, JSON response
    `{ success, status: 'connected', page_name, subscribed }` or `{ success: false, message }`.
  Consumed by Task 8.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/Feature/FacebookOAuthControllerTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Laravel\Socialite\Contracts\User as SocialiteUserContract;
use Laravel\Socialite\Facades\Socialite;
use Mockery;
use Tests\TestCase;

class FacebookOAuthControllerTest extends TestCase
{
    use RefreshDatabase;

    private function tenantAdmin(): array
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create(['tenant_id' => $tenant->id, 'name' => 'Admin', 'email' => 'admin@acme.test', 'password' => bcrypt('x'), 'role' => 'admin']);
        return [$tenant, $user];
    }

    private function fakeSocialiteUser(string $token): SocialiteUserContract
    {
        $socialiteUser = Mockery::mock(SocialiteUserContract::class);
        $socialiteUser->token = $token;
        return $socialiteUser;
    }

    private function stateFor(int $tenantId): string
    {
        return Crypt::encryptString(json_encode(['tenant_id' => $tenantId, 'expires_at' => now()->addMinutes(10)->timestamp]));
    }

    public function test_redirect_sends_the_browser_to_facebook(): void
    {
        [, $user] = $this->tenantAdmin();

        $response = $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->get('/api/integrations/facebook/oauth/redirect');

        $response->assertRedirect();
        $this->assertStringContainsString('facebook.com', $response->headers->get('Location'));
    }

    public function test_callback_with_single_page_redirects_to_settings_connected(): void
    {
        [$tenant] = $this->tenantAdmin();

        Socialite::shouldReceive('driver->stateless->user')->once()->andReturn($this->fakeSocialiteUser('short-lived-token'));
        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response(['access_token' => 'long-lived-token'], 200),
            'graph.facebook.com/*/me/accounts*' => Http::response(['data' => [
                ['id' => '111', 'name' => 'AutoBizPro IL', 'access_token' => 'page-token-111'],
            ]], 200),
            'graph.facebook.com/*/subscribed_apps*' => Http::response(['success' => true], 200),
        ]);

        // No auth, no X-Tenant header, no actingAs — this must work purely from the state param,
        // exactly like Facebook's own redirect would arrive.
        $response = $this->get('/api/integrations/facebook/oauth/callback?state=' . urlencode($this->stateFor($tenant->id)));

        $response->assertRedirect();
        $location = $response->headers->get('Location');
        $this->assertStringContainsString('/settings', $location);
        $this->assertStringContainsString('fb_status=connected', $location);
        $this->assertStringContainsString('fb_subscribed=1', $location);
        $this->assertSame('111', app(SettingsService::class)->get('facebook_page_id'));
    }

    public function test_callback_with_multiple_pages_redirects_with_pages_token_and_no_access_tokens_in_plaintext(): void
    {
        [$tenant] = $this->tenantAdmin();

        Socialite::shouldReceive('driver->stateless->user')->once()->andReturn($this->fakeSocialiteUser('short-lived-token'));
        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response(['access_token' => 'long-lived-token'], 200),
            'graph.facebook.com/*/me/accounts*' => Http::response(['data' => [
                ['id' => '111', 'name' => 'Page One', 'access_token' => 'page-token-111'],
                ['id' => '222', 'name' => 'Page Two', 'access_token' => 'page-token-222'],
            ]], 200),
        ]);

        $response = $this->get('/api/integrations/facebook/oauth/callback?state=' . urlencode($this->stateFor($tenant->id)));

        $response->assertRedirect();
        $location = $response->headers->get('Location');
        $this->assertStringContainsString('fb_status=choose_page', $location);
        $this->assertStringNotContainsString('page-token-111', $location);
        $this->assertStringNotContainsString('page-token-222', $location);
        $this->assertMatchesRegularExpression('/fb_pages_token=[^&]+/', $location);
        $this->assertNull(app(SettingsService::class)->get('facebook_page_id'));
    }

    public function test_callback_with_no_pages_redirects_with_hebrew_error(): void
    {
        [$tenant] = $this->tenantAdmin();

        Socialite::shouldReceive('driver->stateless->user')->once()->andReturn($this->fakeSocialiteUser('short-lived-token'));
        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response(['access_token' => 'long-lived-token'], 200),
            'graph.facebook.com/*/me/accounts*' => Http::response(['data' => []], 200),
        ]);

        $response = $this->get('/api/integrations/facebook/oauth/callback?state=' . urlencode($this->stateFor($tenant->id)));

        $response->assertRedirect();
        $location = urldecode($response->headers->get('Location'));
        $this->assertStringContainsString('fb_status=error', $location);
        $this->assertStringContainsString('לא נמצאו עמודים שאתה מנהל', $location);
    }

    public function test_callback_with_access_denied_redirects_with_cancellation_message(): void
    {
        $response = $this->get('/api/integrations/facebook/oauth/callback?error=access_denied');

        $response->assertRedirect();
        $location = urldecode($response->headers->get('Location'));
        $this->assertStringContainsString('fb_status=error', $location);
        $this->assertStringContainsString('ההתחברות בוטלה', $location);
    }

    public function test_callback_with_invalid_or_missing_state_redirects_with_error(): void
    {
        $response = $this->get('/api/integrations/facebook/oauth/callback?state=not-a-real-encrypted-value');

        $response->assertRedirect();
        $location = urldecode($response->headers->get('Location'));
        $this->assertStringContainsString('fb_status=error', $location);
    }

    public function test_select_page_connects_using_pages_token(): void
    {
        [$tenant] = $this->tenantAdmin();

        Http::fake(['graph.facebook.com/*/subscribed_apps*' => Http::response(['success' => true], 200)]);

        $pagesToken = Crypt::encryptString(json_encode([
            'tenant_id' => $tenant->id,
            'pages' => [
                ['id' => '111', 'name' => 'Page One', 'access_token' => 'page-token-111'],
                ['id' => '222', 'name' => 'Page Two', 'access_token' => 'page-token-222'],
            ],
            'expires_at' => now()->addMinutes(10)->timestamp,
        ]));

        // No auth at all — this must work purely from the pages_token, since it's called by the
        // frontend right after a cross-origin redirect landing, before any session exists.
        $response = $this->postJson('/api/integrations/facebook/oauth/select-page', [
            'pages_token' => $pagesToken,
            'page_id' => '222',
        ]);

        $response->assertOk()->assertJson(['success' => true, 'status' => 'connected', 'page_name' => 'Page Two', 'subscribed' => true]);
        $this->assertSame('222', app(SettingsService::class)->get('facebook_page_id'));
    }

    public function test_select_page_with_expired_pages_token_reports_hebrew_error(): void
    {
        $pagesToken = Crypt::encryptString(json_encode([
            'tenant_id' => 1,
            'pages' => [['id' => '111', 'name' => 'Page One', 'access_token' => 'x']],
            'expires_at' => now()->subMinute()->timestamp,
        ]));

        $this->postJson('/api/integrations/facebook/oauth/select-page', ['pages_token' => $pagesToken, 'page_id' => '111'])
            ->assertStatus(400)
            ->assertJson(['success' => false, 'message' => 'הבחירה פגה, נסה להתחבר שוב']);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=FacebookOAuthControllerTest`
Expected: FAIL — controller and routes don't exist.

- [ ] **Step 3: Write the minimal implementation**

Create `backend/app/Http/Controllers/FacebookOAuthController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Services\Integrations\FacebookOAuthService;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Laravel\Socialite\Facades\Socialite;

/**
 * Facebook Lead Ads — OAuth connect. Replaces manual app_id/secret/page_id entry
 * with a one-click flow that also performs the Page→App webhook subscription that
 * has no reliable manual UI path (see docs/superpowers/specs/2026-08-11-facebook-oauth-lead-ads-design.md).
 *
 * callback() and selectPage() are deliberately NOT behind auth:sanctum — callback()
 * is the literal URL Facebook's browser redirects to after consent, a cross-origin
 * top-level navigation that never carries this app's session cookie (Sanctum's
 * stateful check is Referer/Origin-based, and facebook.com never matches). Tenant
 * identity instead travels in a signed, encrypted `state`/`pages_token` value — see
 * the "OAuth callback identity" section of the design doc for the full reasoning.
 */
class FacebookOAuthController extends Controller
{
    private const TOKEN_TTL_SECONDS = 600; // 10 minutes — bounds the whole redirect round-trip

    /** GET — user-initiated, same-origin, normal authenticated request. */
    public function redirect(): RedirectResponse
    {
        $state = Crypt::encryptString(json_encode([
            'tenant_id'  => app('current_tenant_id'),
            'expires_at' => now()->addSeconds(self::TOKEN_TTL_SECONDS)->timestamp,
        ]));

        return Socialite::driver('facebook')
            ->stateless()
            ->scopes(['pages_show_list', 'pages_read_engagement', 'pages_manage_metadata', 'leads_retrieval'])
            ->with(['state' => $state])
            ->redirect();
    }

    /** GET — hit directly by Facebook's cross-origin redirect. No auth, no session. */
    public function callback(Request $request, FacebookOAuthService $svc): RedirectResponse
    {
        if ($request->query('error') === 'access_denied') {
            return $this->toSettings(['fb_status' => 'error', 'fb_message' => 'ההתחברות בוטלה']);
        }

        $tenantId = $this->decode($request->query('state', ''))['tenant_id'] ?? null;
        if ($tenantId === null) {
            return $this->toSettings(['fb_status' => 'error', 'fb_message' => 'קישור לא תקין או שפג תוקפו, נסה שוב']);
        }
        app()->instance('current_tenant_id', $tenantId);

        $socialiteUser = Socialite::driver('facebook')->stateless()->user();
        $longLivedToken = $svc->exchangeLongLivedToken($socialiteUser->token);
        $pages = $svc->fetchPages($longLivedToken);

        if (empty($pages)) {
            return $this->toSettings(['fb_status' => 'error', 'fb_message' => 'לא נמצאו עמודים שאתה מנהל']);
        }

        if (count($pages) > 1) {
            $pagesToken = Crypt::encryptString(json_encode([
                'tenant_id'  => $tenantId,
                'pages'      => $pages,
                'expires_at' => now()->addSeconds(self::TOKEN_TTL_SECONDS)->timestamp,
            ]));
            return $this->toSettings([
                'fb_status'      => 'choose_page',
                'fb_pages_token' => $pagesToken,
                'fb_pages'       => json_encode(array_map(fn (array $p) => ['id' => $p['id'], 'name' => $p['name']], $pages)),
            ]);
        }

        $result = $svc->connectPage($pages[0], $tenantId);
        return $this->toSettings([
            'fb_status'     => 'connected',
            'fb_page'       => $result['page_name'],
            'fb_subscribed' => $result['subscribed'] ? '1' : '0',
        ]);
    }

    /** POST — called by our own frontend right after landing back on Settings.
     *  No auth:sanctum: the signed pages_token (minted only by callback() above,
     *  valid for 10 minutes) is the credential. */
    public function selectPage(Request $request, FacebookOAuthService $svc): JsonResponse
    {
        $data = $request->validate(['pages_token' => 'required|string', 'page_id' => 'required|string']);

        $payload = $this->decode($data['pages_token']);
        if ($payload === null) {
            return response()->json(['success' => false, 'message' => 'הבחירה פגה, נסה להתחבר שוב'], 400);
        }

        $page = collect($payload['pages'] ?? [])->firstWhere('id', $data['page_id']);
        if (!$page) {
            return response()->json(['success' => false, 'message' => 'העמוד שנבחר לא נמצא, נסה להתחבר שוב'], 404);
        }

        $result = $svc->connectPage($page, $payload['tenant_id']);
        return response()->json(['success' => true, 'status' => 'connected'] + $result);
    }

    /** Decrypt a state/pages_token value, returning null if invalid or expired. */
    private function decode(string $token): ?array
    {
        try {
            $payload = json_decode(Crypt::decryptString($token), true);
        } catch (DecryptException $e) {
            return null;
        }
        if (!is_array($payload) || ($payload['expires_at'] ?? 0) < now()->timestamp) {
            return null;
        }
        return $payload;
    }

    private function toSettings(array $query): RedirectResponse
    {
        return redirect('/settings?' . http_build_query($query));
    }
}
```

Add to `backend/routes/api.php`. The `redirect` route stays inside the existing `auth:sanctum`
group, right after the existing `/integrations/settings` routes (same as before):

```php
    // Facebook Lead Ads — OAuth connect (replaces manual app_id/secret entry)
    Route::get('/integrations/facebook/oauth/redirect', [\App\Http\Controllers\FacebookOAuthController::class, 'redirect'])
        ->middleware('permission:users,can_update');
```

`callback` and `selectPage` go **outside** that group — find the other public integration routes
near the top of the file (the `/integrations/whatsapp/webhook/{tenant}`,
`/integrations/facebook/webhook/{tenant}` routes) and add these alongside them:

```php
// Facebook Lead Ads OAuth callback — hit directly by Facebook's cross-origin browser
// redirect, so it can't sit behind auth:sanctum (see FacebookOAuthController's class
// doc comment). Tenant identity travels in the signed `state`/`pages_token` instead.
Route::get('/integrations/facebook/oauth/callback', [\App\Http\Controllers\FacebookOAuthController::class, 'callback'])
    ->middleware('throttle:20,1');
Route::post('/integrations/facebook/oauth/select-page', [\App\Http\Controllers\FacebookOAuthController::class, 'selectPage'])
    ->middleware('throttle:20,1');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=FacebookOAuthControllerTest`
Expected: PASS — 8 tests.

- [ ] **Step 5: Run the full backend test suite to confirm nothing broke**

Run: `cd backend && php artisan test`
Expected: PASS — all tests, including `FacebookLeadAdsTest`, `LeadObserverAutomationTest`,
`FacebookOAuthSettingsTest`, `FacebookOAuthServiceTest`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Controllers/FacebookOAuthController.php backend/routes/api.php backend/tests/Feature/FacebookOAuthControllerTest.php
git commit -m "feat: add Facebook OAuth redirect/callback/select-page endpoints (stateless, signed state)"
```

---

### Task 7: `FacebookLeadAdsService::fetchLead` uses the stored page token

**Files:**
- Modify: `backend/app/Services/Integrations/FacebookLeadAdsService.php:88-108` (`fetchLead`),
  `:52-74` (`processWebhook` — the app_id/app_secret guard at the top)
- Modify: `backend/tests/Feature/FacebookLeadAdsTest.php`

**Interfaces:**
- Consumes: `SettingsService::get('facebook_page_access_token')` instead of
  `facebook_app_id`/`facebook_app_secret`.

- [ ] **Step 1: Update the failing test first**

In `backend/tests/Feature/FacebookLeadAdsTest.php`, replace `tenantWithSettings()`:

```php
    private function tenantWithSettings(): Tenant
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        TenantSetting::create(['key' => 'facebook_page_access_token', 'value' => 'page-token-abc', 'tenant_id' => $tenant->id]);
        return $tenant;
    }
```

Add two new tests at the end of the class, before the closing `}`:

```php
    public function test_fetch_lead_uses_page_access_token_not_app_credentials(): void
    {
        $this->tenantWithSettings();

        Http::fake([
            'graph.facebook.com/*' => Http::response([
                'field_data' => [
                    ['name' => 'full_name', 'values' => ['דני כהן']],
                    ['name' => 'phone_number', 'values' => ['0541234567']],
                ],
                'form_id' => 'form789',
            ], 200),
        ]);

        $this->postJson('/api/integrations/facebook/webhook/acme', $this->leadgenPayload('lg_003'))->assertOk();

        Http::assertSent(fn ($request) => $request['access_token'] === 'page-token-abc');
    }

    public function test_expired_page_token_marks_connection_as_needing_renewal(): void
    {
        $tenant = $this->tenantWithSettings();

        // Graph API's shape for an expired/invalid token: HTTP 400, OAuthException, code 190.
        Http::fake([
            'graph.facebook.com/*' => Http::response([
                'error' => ['message' => 'Error validating access token', 'type' => 'OAuthException', 'code' => 190],
            ], 400),
        ]);

        $this->postJson('/api/integrations/facebook/webhook/acme', $this->leadgenPayload('lg_004'))->assertOk();

        $this->assertSame(0, Lead::count());
        $this->assertSame('needs_renewal', app(\App\Services\SettingsService::class)->get('facebook_connection_status'));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=FacebookLeadAdsTest`
Expected: FAIL — `processWebhook` still checks for `facebook_app_id`/`facebook_app_secret`, which
no longer exist, so it bails out before calling Graph API at all; the new assertion finds no
matching request.

- [ ] **Step 3: Update the implementation**

In `backend/app/Services/Integrations/FacebookLeadAdsService.php`, replace `processWebhook`
(currently lines 52-74):

```php
    public function processWebhook(array $payload, int $tenantId): void
    {
        $pageAccessToken = $this->settings->get('facebook_page_access_token');

        if (!$pageAccessToken) {
            Log::warning('Facebook: no page access token connected', ['tenant' => $tenantId]);
            return;
        }

        foreach ($payload['entry'] ?? [] as $entry) {
            foreach ($entry['changes'] ?? [] as $change) {
                $leadgenId = $change['value']['leadgen_id'] ?? null;
                $formId    = $change['value']['form_id'] ?? null;
                if (!$leadgenId) continue;

                $leadData = $this->fetchLead($leadgenId, $pageAccessToken);
                if (!$leadData) continue;

                $this->upsertLead($leadData, $formId, $leadgenId, $tenantId);
            }
        }
    }
```

Replace `fetchLead` (currently lines 88-108):

```php
    private function fetchLead(string $leadgenId, string $pageAccessToken): ?array
    {
        try {
            $response = Http::timeout(10)
                ->get("https://graph.facebook.com/v21.0/{$leadgenId}", [
                    'access_token' => $pageAccessToken,
                    'fields'       => 'field_data,created_time,ad_id,ad_name,form_id',
                ]);

            if (!$response->ok()) {
                // Graph API's shape for an expired/revoked token: OAuthException, code 190.
                // Flag it so the Settings screen can tell the tenant to reconnect, instead of
                // leads silently vanishing with no visible cause.
                if ($response->json('error.code') === 190) {
                    $this->settings->set('facebook_connection_status', 'needs_renewal');
                }
                Log::warning('Facebook: failed to fetch lead', ['id' => $leadgenId, 'status' => $response->status()]);
                return null;
            }

            return $response->json();
        } catch (\Throwable $e) {
            Log::error('Facebook: exception fetching lead', ['error' => $e->getMessage()]);
            return null;
        }
    }
```

`verifySignature()` stays as-is but now reads `config('services.facebook.client_secret')` instead
of the removed `facebook_app_secret` setting — update it:

```php
    public function verifySignature(string $rawBody, string $signature): bool
    {
        $appSecret = config('services.facebook.client_secret');
        if (!$appSecret) return false;

        $expected = 'sha256=' . hash_hmac('sha256', $rawBody, $appSecret);
        return hash_equals($expected, $signature);
    }
```

And `verifyWebhook()` reads the verify token from env now instead of the removed
`facebook_verify_token` setting:

```php
    public function verifyWebhook(array $params): string|false
    {
        $verifyToken = config('services.facebook.verify_token');
        if (
            ($params['hub_mode'] ?? '') === 'subscribe' &&
            ($params['hub_verify_token'] ?? '') === $verifyToken &&
            !empty($verifyToken)
        ) {
            return $params['hub_challenge'] ?? '0';
        }
        return false;
    }
```

This needs one more config key — add to `backend/config/services.php`'s `facebook` block (from
Task 1):

```php
    'facebook' => [
        'client_id'     => env('FACEBOOK_APP_ID'),
        'client_secret' => env('FACEBOOK_APP_SECRET'),
        'redirect'      => env('FACEBOOK_REDIRECT_URI'),
        'verify_token'  => env('FACEBOOK_VERIFY_TOKEN'),
    ],
```

And to `backend/.env.example`:

```
FACEBOOK_VERIFY_TOKEN=
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=FacebookLeadAdsTest`
Expected: PASS — 3 tests (2 existing + the new one).

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: PASS — all tests.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Services/Integrations/FacebookLeadAdsService.php backend/config/services.php backend/.env.example backend/tests/Feature/FacebookLeadAdsTest.php
git commit -m "feat: read Facebook lead data with the tenant's page access token"
```

---

### Task 8: Frontend — replace manual fields with a Connect button

**Files:**
- Modify: `frontend/src/api/integrations.js`
- Modify: `frontend/src/pages/settings/SettingsPage.jsx:531-598` (`FacebookCard`)

**Interfaces:**
- Consumes: `GET /api/integrations/facebook/oauth/redirect` (a plain full-page navigation, not
  fetch — it's a 302 to Meta), and reads the outcome of `GET .../oauth/callback` from
  `window.location.search` on mount, since Task 6's redesign makes `callback` redirect straight
  back to `/settings?fb_status=...` instead of being called by the frontend. Calls
  `POST /api/integrations/facebook/oauth/select-page` with `{ pages_token, page_id }` for the
  multi-page case (Task 6).
- No test file — this repo has no component-test setup for Settings cards (only `src/hooks` and
  `src/lib` have `vitest` unit tests); verify by running the dev server and clicking through, as
  Task 8's own steps do.

- [ ] **Step 1: Add the select-page API call**

In `frontend/src/api/integrations.js`, add inside the `integrationsApi` object, after
`googleSheetsExport`:

```js
  facebookSelectPage: (pagesToken, pageId) => client.post('/integrations/facebook/oauth/select-page', { pages_token: pagesToken, page_id: pageId }),
```

There's no `facebookOAuthCallback` call — Task 6's `callback` endpoint is hit directly by Facebook's
browser redirect and never fetched by the frontend; the SPA only ever reads its outcome from the URL
query string it gets redirected back to.

- [ ] **Step 2: Rewrite `FacebookCard`**

Replace the whole `FacebookCard` function in `frontend/src/pages/settings/SettingsPage.jsx`
(currently lines 533-598) with:

```jsx
function FacebookCard({ integ, qc, can }) {
  const [pageChoices, setPageChoices] = useState(null) // [{id, name}] parsed from fb_pages
  const [pagesToken, setPagesToken] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [justConnected, setJustConnected] = useState(null) // {page, subscribed} from a fresh redirect

  const connected = Boolean(integ?.facebook_page_id)
  const pageName = justConnected?.page ?? integ?.facebook_page_name
  const needsRenewal = integ?.facebook_connection_status === 'needs_renewal'

  // Task 6's callback() redirects Facebook's own browser navigation straight back here
  // with the outcome encoded in the query string — it never gets fetched by this page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('fb_status')
    if (!status) return
    window.history.replaceState({}, '', window.location.pathname)

    if (status === 'connected') {
      setJustConnected({ page: params.get('fb_page'), subscribed: params.get('fb_subscribed') === '1' })
      qc.invalidateQueries({ queryKey: ['integrations-settings'] })
    } else if (status === 'choose_page') {
      setPagesToken(params.get('fb_pages_token'))
      try {
        setPageChoices(JSON.parse(params.get('fb_pages') || '[]'))
      } catch {
        setError('שגיאה בטעינת רשימת העמודים, נסה שוב')
      }
    } else if (status === 'error') {
      setError(params.get('fb_message') || 'שגיאה בהתחברות')
    }
  }, [])

  const selectPage = async (pageId) => {
    setConnecting(true)
    setError('')
    try {
      const { data } = await integrationsApi.facebookSelectPage(pagesToken, pageId)
      if (!data.success) {
        setError(data.message)
      } else {
        setPageChoices(null)
        setJustConnected({ page: data.page_name, subscribed: data.subscribed })
        qc.invalidateQueries({ queryKey: ['integrations-settings'] })
      }
    } finally {
      setConnecting(false)
    }
  }

  const startConnect = () => {
    window.location.href = '/api/integrations/facebook/oauth/redirect'
  }

  return (
    <Card>
      <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">📘 Facebook Lead Ads</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">קבל לידים ממודעות פייסבוק אוטומטית — התחבר בקליק אחד, בלי להגדיר כלום ידנית ב-Meta.</p>

      {connected && !pageChoices && !needsRenewal && (
        <div className="text-sm text-green-700 dark:text-green-400 mb-3">✓ מחובר לעמוד: <strong>{pageName}</strong></div>
      )}

      {justConnected && !justConnected.subscribed && (
        <div className="text-sm text-amber-700 dark:text-amber-400 mb-3">⚠ העמוד חובר אך רישום ללידים נכשל — נסה להתחבר שוב.</div>
      )}

      {connected && needsRenewal && (
        <div className="text-sm text-amber-700 dark:text-amber-400 mb-3">⚠ החיבור לעמוד <strong>{pageName}</strong> פג — יש להתחבר מחדש כדי להמשיך לקבל לידים.</div>
      )}

      {error && <div className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</div>}

      {pageChoices && (
        <div className="space-y-2 mb-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">בחר את העמוד שברצונך לחבר:</p>
          {pageChoices.map((p) => (
            <button key={p.id} type="button" disabled={connecting} onClick={() => selectPage(p.id)}
              className="block w-full text-right border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
              {p.name}
            </button>
          ))}
        </div>
      )}

      {can('users', 'can_update') && !pageChoices && (
        <button type="button" disabled={connecting} onClick={startConnect}
          className="bg-[#2398c2] hover:bg-[#1c7ea3] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {connected ? 'התחבר לעמוד אחר' : 'התחבר עם פייסבוק'}
        </button>
      )}
    </Card>
  )
}
```

Update the call site (currently line 516) — drop the now-unused `tenantSubdomain` prop:

```jsx
      <FacebookCard integ={integ} qc={qc} can={can} />
```

- [ ] **Step 3: Verify by running the dev server**

Run: `cd frontend && npm run dev`, open the Settings page in a browser, confirm the Facebook card
renders with a single "התחבר עם פייסבוק" button and no text inputs. Full OAuth round-trip can't be
verified until `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` are set in `.env` and the Meta App's valid
OAuth redirect URI is registered (Task 9 covers the Meta-side setup) — that end-to-end check happens
after this plan's tasks are all merged.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/integrations.js frontend/src/pages/settings/SettingsPage.jsx
git commit -m "feat: replace manual Facebook settings form with Connect button"
```

---

### Task 9: Meta App Review submission materials

**Files:**
- Create: `docs/superpowers/specs/2026-08-11-facebook-app-review-submission.md`

**Interfaces:** None — this is a documentation deliverable, not code. No prior task depends on it,
and it doesn't block merging Tasks 1-8 (the flow works for admin/dev/tester roles on the app without
Advanced Access, per the design doc's App Review section).

- [ ] **Step 1: Write the submission document**

Create `docs/superpowers/specs/2026-08-11-facebook-app-review-submission.md` with these sections,
filled in with the actual specifics of this integration (not placeholders):

```markdown
# Meta App Review Submission — leads_retrieval & pages_manage_metadata

## Permissions requested
- `leads_retrieval` — read lead data via Graph API after a leadgen webhook fires.
- `pages_manage_metadata` — subscribe the customer's Page to our app's leadgen webhook field.
- `pages_show_list`, `pages_read_engagement` — list the Pages the connecting user manages, and read basic Page info to display the connected Page's name in Settings.

## How each permission is used (for the reviewer)
[Screen recording script:]
1. Admin opens AutoBizPro Settings → Integrations → Facebook Lead Ads.
2. Clicks "התחבר עם פייסבוק" ("Connect with Facebook").
3. Meta's OAuth consent screen appears; admin selects their Page and approves.
4. Redirected back to Settings; card shows "✓ מחובר לעמוד: <Page name>".
5. A test lead is submitted via Meta's own Lead Ads Testing Tool.
6. The lead appears in AutoBizPro's Leads list within seconds, with source "פייסבוק".

## Privacy policy
https://autobizproil.netlify.app/privacy.html

## Data use
Only name, phone, and email from the lead form are stored, scoped to the connecting tenant, used
solely to populate the CRM's Leads list. No data is shared with third parties. See the privacy
policy for the full statement.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-08-11-facebook-app-review-submission.md
git commit -m "docs: Meta App Review submission materials for Facebook Lead Ads"
```

---

## Post-plan manual steps (not code, do after all tasks merge)

1. Create/confirm the Meta App's OAuth settings: add `FACEBOOK_REDIRECT_URI` value to the app's
   **Valid OAuth Redirect URIs** list in Facebook Login for Business → Settings.
2. Set `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI`, `FACEBOOK_VERIFY_TOKEN` in
   the production `.env`, and the same `FACEBOOK_VERIFY_TOKEN` in the Meta App's Webhooks config for
   the `Page` object (this is now the one piece still requiring the App Dashboard, done once for the
   whole install, not per tenant).
3. Test the full connect flow against the real autobizpro Page (works without App Review, since the
   connecting user is an Admin/Developer on the app).
4. Submit the Task 9 document through Meta's App Review UI for Advanced Access, so customers who are
   not Admins/Developers/Testers on the app can also connect.
