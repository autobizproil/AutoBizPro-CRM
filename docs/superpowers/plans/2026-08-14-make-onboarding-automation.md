# Automating Make.com Facebook Lead Ads Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manually building a Make.com scenario in Make's UI for every new Facebook Lead Ads
customer with one artisan command that provisions the secret and the scenario via Make's REST API,
leaving only the customer's own Facebook OAuth consent click as a manual step.

**Architecture:** A new `MakeApiService` (mirrors the existing `FacebookOAuthService` pattern —
constructor-injected dependencies, `Http::` calls, `Log::error` + thrown exception on failure) wraps
Make's REST API for scenario creation. A new artisan command `make:onboard-facebook-bridge {tenant}`
resolves the tenant, generates/reuses its `make_lead_webhook_secret` via the existing
`SettingsService`, builds the scenario blueprint (using the module identifiers confirmed correct this
session), calls `MakeApiService::createScenario()`, and prints the result.

**Tech Stack:** Laravel 12 (PHP 8.2), `Illuminate\Support\Facades\Http`, PHPUnit feature tests with
`Http::fake()` (no live Make API token available in this environment — see the final manual
verification task).

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-08-14-make-onboarding-automation-design.md` — read it
  before starting; this plan implements it section by section.
- No DB migration needed. Reuses the existing `make_lead_webhook_secret` / `tenant_settings`
  mechanism from `docs/superpowers/specs/2026-08-13-make-facebook-lead-bridge-design.md`.
- Secret generation must be **idempotent by default**: if `make_lead_webhook_secret` already exists
  for the tenant, reuse it — do not rotate unless `--regenerate-secret` is passed. Mirrors
  `IntegrationsController::generateMakeWebhookSecret()`'s generation logic
  (`bin2hex(random_bytes(32))` via `SettingsService::set`), but that endpoint always rotates — this
  command's default behavior is different and must not call that endpoint's code path directly for
  the "reuse" case.
- Make API authentication header is `Authorization: Token {MAKE_API_TOKEN}` — **not** `Bearer`. This
  is Make's own convention, different from every other integration in this codebase.
- The scenario's HTTP action target URL is `{config('app.url')}/api/integrations/make/lead/{tenant}`,
  built with Laravel's `url()` helper — same pattern `PdfController` already uses for tenant-facing
  URLs (see `backend/app/Http/Controllers/PdfController.php:166`). Tenant resolution on this route is
  path-based (`Tenant::where('subdomain', $tenant)`), not Host-header-based, so whichever hostname
  `APP_URL` points to in production works for every tenant regardless of which of the two DuckDNS
  hostnames a given customer's Page ends up associated with — confirmed this session (sonia-crm's
  scenario posts to `https://sonia-crm.duckdns.org/...` but would work identically posting to
  `https://autobiz-crm.duckdns.org/...`, since both resolve to the same app and the URL path segment
  is what selects the tenant).
- Blueprint module identifiers (confirmed correct this session, do not re-guess):
  - Trigger: `facebook-lead-ads:WatchLeads`, version `2`. Created with empty/no connection — Make
    permits creating a scenario with an unconfigured trigger module; it simply can't run until a
    human configures the connection, page, and form.
  - Action: `http:ActionSendData`, version `3`.
- Scenario scheduling type must be `on-demand` — never auto-activate. A scenario with an unconfigured
  trigger can't meaningfully run yet regardless, but being explicit here matches the design spec.
- Follow existing code style: service classes are plain classes, constructor-injected where they
  have dependencies (see `FacebookOAuthService`), thrown `\RuntimeException` on unrecoverable API
  failure with `Log::error(...)` first including `status` and `body` from the failed response.
- Tests use `Http::fake()` exclusively — no live network calls in the test suite, consistent with
  `FacebookOAuthServiceTest.php` and every other integration test in this codebase.

---

### Task 1: `MakeApiService` + config

**Files:**
- Create: `backend/app/Services/Integrations/MakeApiService.php`
- Modify: `backend/config/services.php` (add `make` block, after the existing `facebook` block)
- Modify: `backend/.env.example` (add `MAKE_*` keys)
- Test: `backend/tests/Feature/MakeApiServiceTest.php`

**Interfaces:**
- Produces: `MakeApiService::createScenario(string $name, array $blueprint): array` — returns the
  decoded JSON response body from Make's API on success (the caller, Task 2, reads
  `$result['scenario']['id']` and builds the scenario's UI URL from it). Throws `\RuntimeException`
  on any non-2xx response, with the message being Make's raw response body (so the operator can see
  exactly what Make rejected — e.g. a bad scope or malformed blueprint).
- Consumes: `config('services.make.api_token')`, `config('services.make.team_id')`,
  `config('services.make.api_base_url')` — all added by this task.

- [ ] **Step 1: Add config**

In `backend/config/services.php`, add after the `'facebook' => [...]` block (before the closing
`];` of the returned array):

```php
    'make' => [
        'api_token'    => env('MAKE_API_TOKEN'),
        'team_id'      => env('MAKE_TEAM_ID'),
        'api_base_url' => env('MAKE_API_BASE_URL', 'https://eu1.make.com/api/v2'),
    ],
```

In `backend/.env.example`, add after the Facebook Lead Ads OAuth block:

```
# Make.com — Facebook Lead Ads onboarding automation (personal API token, NOT the
# Claude/MCP OAuth connection — that connection has no organization/app-read scope).
# Create at Make.com -> Profile -> API -> "+ Add token", with scenarios:read + scenarios:write.
MAKE_API_TOKEN=
MAKE_TEAM_ID=
MAKE_API_BASE_URL=https://eu1.make.com/api/v2
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/Feature/MakeApiServiceTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Services\Integrations\MakeApiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MakeApiServiceTest extends TestCase
{
    use RefreshDatabase;

    private function configureMake(): void
    {
        config([
            'services.make.api_token'    => 'test-token-abc',
            'services.make.team_id'      => 1047106,
            'services.make.api_base_url' => 'https://eu1.make.com/api/v2',
        ]);
    }

    public function test_create_scenario_sends_correct_request_and_returns_response(): void
    {
        $this->configureMake();

        Http::fake([
            'eu1.make.com/api/v2/scenarios*' => Http::response([
                'scenario' => ['id' => 999, 'name' => 'Test Scenario'],
            ], 200),
        ]);

        $blueprint = ['name' => 'Test Scenario', 'flow' => [], 'metadata' => ['version' => 1]];

        $service = app(MakeApiService::class);
        $result  = $service->createScenario('Test Scenario', $blueprint);

        $this->assertSame(999, $result['scenario']['id']);

        Http::assertSent(function ($request) {
            return $request->url() === 'https://eu1.make.com/api/v2/scenarios?teamId=1047106'
                && $request->method() === 'POST'
                && $request->hasHeader('Authorization', 'Token test-token-abc')
                && $request['blueprint'] === json_encode(['name' => 'Test Scenario', 'flow' => [], 'metadata' => ['version' => 1]])
                && $request['scheduling'] === json_encode(['type' => 'on-demand']);
        });
    }

    public function test_create_scenario_throws_with_make_error_body_on_failure(): void
    {
        $this->configureMake();

        Http::fake([
            'eu1.make.com/api/v2/scenarios*' => Http::response([
                'message' => 'Insufficient rights, admin permission "organization view" is needed.',
            ], 403),
        ]);

        $service = app(MakeApiService::class);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Insufficient rights, admin permission "organization view" is needed.');

        $service->createScenario('Test Scenario', ['name' => 'Test Scenario', 'flow' => [], 'metadata' => ['version' => 1]]);
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=MakeApiServiceTest`
Expected: FAIL — `MakeApiService` class doesn't exist.

- [ ] **Step 4: Write the implementation**

Create `backend/app/Services/Integrations/MakeApiService.php`:

```php
<?php

namespace App\Services\Integrations;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Thin wrapper around Make.com's REST API, used only by
 * `make:onboard-facebook-bridge` to provision a customer's scenario without
 * a human clicking through Make's UI. Uses a personal API token
 * (MAKE_API_TOKEN) with full scopes — deliberately NOT the Claude/MCP OAuth
 * connection, which has no organization/app-read scope (confirmed
 * 2026-08-14 — see docs/superpowers/specs/2026-08-14-make-onboarding-automation-design.md).
 */
class MakeApiService
{
    /**
     * Create a scenario in the configured team. Scenario starts inactive
     * (on-demand scheduling) — Make doesn't allow activating a scenario
     * whose trigger module has no connection configured yet.
     *
     * @param array $blueprint Must have 'name', 'flow', 'metadata' keys.
     * @return array Decoded JSON response body from Make's API.
     * @throws \RuntimeException on any non-2xx response.
     */
    public function createScenario(string $name, array $blueprint): array
    {
        $teamId = config('services.make.team_id');

        $response = Http::withHeaders([
            'Authorization' => 'Token ' . config('services.make.api_token'),
        ])->asForm()->post(
            rtrim(config('services.make.api_base_url'), '/') . '/scenarios',
            [
                'teamId'     => $teamId,
                'blueprint'  => json_encode($blueprint),
                'scheduling' => json_encode(['type' => 'on-demand']),
            ]
        );

        if (!$response->successful()) {
            Log::error('Make API: scenario creation failed', [
                'status' => $response->status(),
                'body'   => $response->body(),
            ]);
            throw new \RuntimeException($response->json('message') ?? $response->body());
        }

        return $response->json();
    }
}
```

Note: `Http::asForm()->post($url, $data)` sends `$data` as the request body
(`application/x-www-form-urlencoded`) — `teamId` needs to be a query parameter per Make's documented
API shape, not a form field. Fix before running: build the URL with the query string appended
directly, e.g.:

```php
rtrim(config('services.make.api_base_url'), '/') . '/scenarios?teamId=' . $teamId
```

and pass only `blueprint`/`scheduling` in the form body. Use this corrected version — the test in
Step 2 already asserts the URL includes `?teamId=1047106`, so this fix is required for the test to
pass, not optional.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=MakeApiServiceTest`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Services/Integrations/MakeApiService.php backend/config/services.php backend/.env.example backend/tests/Feature/MakeApiServiceTest.php
git commit -m "feat: MakeApiService for scenario provisioning via Make's REST API"
```

---

### Task 2: `make:onboard-facebook-bridge` artisan command

**Files:**
- Create: `backend/app/Console/Commands/OnboardFacebookBridge.php`
- Test: `backend/tests/Feature/OnboardFacebookBridgeCommandTest.php`

**Interfaces:**
- Consumes: `MakeApiService::createScenario(string $name, array $blueprint): array` (Task 1).
  `SettingsService::get(string $key, $default = null)` / `SettingsService::set(string $key, $value)`
  (pre-existing, `backend/app/Services/SettingsService.php`).
- Produces: the `make:onboard-facebook-bridge {tenant} {--regenerate-secret}` console command.
  Nothing later in this plan depends on it — this is the plan's final task.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/OnboardFacebookBridgeCommandTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\TenantSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OnboardFacebookBridgeCommandTest extends TestCase
{
    use RefreshDatabase;

    private function configureMake(): void
    {
        config([
            'services.make.api_token'    => 'test-token-abc',
            'services.make.team_id'      => 1047106,
            'services.make.api_base_url' => 'https://eu1.make.com/api/v2',
            'app.url'                    => 'https://autobiz-crm.duckdns.org',
        ]);
    }

    public function test_unknown_tenant_aborts_with_error(): void
    {
        $this->configureMake();

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'does-not-exist'])
            ->assertExitCode(1)
            ->expectsOutputToContain('not found');
    }

    public function test_missing_make_config_aborts_before_any_api_call(): void
    {
        config(['services.make.api_token' => null, 'services.make.team_id' => null]);
        Tenant::create(['name' => 'Sonia', 'subdomain' => 'sonia-crm', 'status' => 'active']);

        Http::fake(); // if the command makes any HTTP call despite missing config, this test catches it

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'sonia-crm'])
            ->assertExitCode(1)
            ->expectsOutputToContain('MAKE_API_TOKEN');

        Http::assertNothingSent();
    }

    public function test_generates_new_secret_and_creates_scenario(): void
    {
        $this->configureMake();
        $tenant = Tenant::create(['name' => 'Sonia', 'subdomain' => 'sonia-crm', 'status' => 'active']);

        Http::fake([
            'eu1.make.com/api/v2/scenarios*' => Http::response([
                'scenario' => ['id' => 555, 'name' => 'Sonia - Facebook Lead Ads Bridge'],
            ], 200),
        ]);

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'sonia-crm'])
            ->assertExitCode(0)
            ->expectsOutputToContain('https://eu1.make.com/1047106/scenarios/555')
            ->assertSuccessful();

        $secret = TenantSetting::where('tenant_id', $tenant->id)
            ->where('key', 'make_lead_webhook_secret')->first();
        $this->assertNotNull($secret);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $secret->value);

        Http::assertSent(function ($request) use ($secret) {
            $blueprint = json_decode($request['blueprint'], true);
            $httpModule = $blueprint['flow'][1];
            return $httpModule['module'] === 'http:ActionSendData'
                && $httpModule['mapper']['url'] === 'https://autobiz-crm.duckdns.org/api/integrations/make/lead/sonia-crm'
                && $httpModule['mapper']['headers'][0]['value'] === $secret->value
                && str_contains($httpModule['mapper']['data'], '{{1.data.full_name}}');
        });
    }

    public function test_reuses_existing_secret_by_default(): void
    {
        $this->configureMake();
        $tenant = Tenant::create(['name' => 'Sonia', 'subdomain' => 'sonia-crm', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        TenantSetting::create([
            'tenant_id' => $tenant->id, 'key' => 'make_lead_webhook_secret', 'value' => 'existing-secret-value',
        ]);

        Http::fake(['eu1.make.com/api/v2/scenarios*' => Http::response(['scenario' => ['id' => 1]], 200)]);

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'sonia-crm'])->assertExitCode(0);

        $this->assertSame(
            'existing-secret-value',
            TenantSetting::where('tenant_id', $tenant->id)->where('key', 'make_lead_webhook_secret')->first()->value
        );
    }

    public function test_regenerate_secret_flag_rotates_existing_secret(): void
    {
        $this->configureMake();
        $tenant = Tenant::create(['name' => 'Sonia', 'subdomain' => 'sonia-crm', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        TenantSetting::create([
            'tenant_id' => $tenant->id, 'key' => 'make_lead_webhook_secret', 'value' => 'old-secret-value',
        ]);

        Http::fake(['eu1.make.com/api/v2/scenarios*' => Http::response(['scenario' => ['id' => 1]], 200)]);

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'sonia-crm', '--regenerate-secret' => true])
            ->assertExitCode(0);

        $newValue = TenantSetting::where('tenant_id', $tenant->id)->where('key', 'make_lead_webhook_secret')->first()->value;
        $this->assertNotSame('old-secret-value', $newValue);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $newValue);
    }

    public function test_make_api_failure_surfaces_error_and_aborts(): void
    {
        $this->configureMake();
        Tenant::create(['name' => 'Sonia', 'subdomain' => 'sonia-crm', 'status' => 'active']);

        Http::fake([
            'eu1.make.com/api/v2/scenarios*' => Http::response(['message' => 'Bad blueprint'], 422),
        ]);

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'sonia-crm'])
            ->assertExitCode(1)
            ->expectsOutputToContain('Bad blueprint');
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=OnboardFacebookBridgeCommandTest`
Expected: FAIL — command `make:onboard-facebook-bridge` doesn't exist.

- [ ] **Step 3: Write the implementation**

Create `backend/app/Console/Commands/OnboardFacebookBridge.php`:

```php
<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Services\Integrations\MakeApiService;
use App\Services\SettingsService;
use Illuminate\Console\Command;

class OnboardFacebookBridge extends Command
{
    protected $signature = 'make:onboard-facebook-bridge {tenant} {--regenerate-secret}';

    protected $description = 'Provision a Make.com Facebook Lead Ads bridge scenario for a tenant (secret + scenario, everything short of the customer\'s own Facebook page connection)';

    public function handle(MakeApiService $makeApi): int
    {
        $tenantModel = Tenant::where('subdomain', $this->argument('tenant'))->first();
        if (!$tenantModel) {
            $this->error("Tenant '{$this->argument('tenant')}' not found.");
            return 1;
        }

        if (empty(config('services.make.api_token'))) {
            $this->error('MAKE_API_TOKEN is not configured — set it in .env before running this command.');
            return 1;
        }
        if (empty(config('services.make.team_id'))) {
            $this->error('MAKE_TEAM_ID is not configured — set it in .env before running this command.');
            return 1;
        }

        app()->instance('current_tenant_id', $tenantModel->id);
        $settings = app(SettingsService::class);

        $existingSecret = $settings->get('make_lead_webhook_secret');
        if ($existingSecret && !$this->option('regenerate-secret')) {
            $secret = $existingSecret;
            $this->info('Reusing existing make_lead_webhook_secret.');
        } else {
            $secret = bin2hex(random_bytes(32));
            $settings->set('make_lead_webhook_secret', $secret);
            $this->info($existingSecret ? 'Rotated make_lead_webhook_secret.' : 'Generated new make_lead_webhook_secret.');
        }

        $endpointUrl = rtrim(config('app.url'), '/') . '/api/integrations/make/lead/' . $tenantModel->subdomain;
        $scenarioName = "{$tenantModel->name} - Facebook Lead Ads Bridge";

        $blueprint = [
            'name' => $scenarioName,
            'flow' => [
                [
                    'id' => 1,
                    'module' => 'facebook-lead-ads:WatchLeads',
                    'version' => 2,
                    'parameters' => [],
                    'mapper' => [],
                    'metadata' => ['designer' => ['x' => 0, 'y' => 0]],
                ],
                [
                    'id' => 2,
                    'module' => 'http:ActionSendData',
                    'version' => 3,
                    'parameters' => ['handleErrors' => false, 'useNewZLibDeCompress' => true],
                    'mapper' => [
                        'url' => $endpointUrl,
                        'method' => 'post',
                        'headers' => [
                            ['name' => 'X-Webhook-Secret', 'value' => $secret],
                            ['name' => 'Content-Type', 'value' => 'application/json'],
                        ],
                        'qs' => [],
                        'bodyType' => 'raw',
                        'parseResponse' => true,
                        'contentType' => 'application/json',
                        'data' => "{\n  \"name\": \"{{1.data.full_name}}\",\n  \"phone\": \"{{1.data.phone_number}}\",\n  \"email\": \"{{1.data.email}}\",\n  \"form_name\": \"\"\n}",
                    ],
                    'metadata' => ['designer' => ['x' => 300, 'y' => 0]],
                ],
            ],
            'metadata' => ['version' => 1],
        ];

        try {
            $result = $makeApi->createScenario($scenarioName, $blueprint);
        } catch (\RuntimeException $e) {
            $this->error('Make API error: ' . $e->getMessage());
            return 1;
        }

        $scenarioId = $result['scenario']['id'] ?? null;
        $teamId = config('services.make.team_id');
        $scenarioUrl = "https://eu1.make.com/{$teamId}/scenarios/{$scenarioId}";

        $this->info("Scenario created: {$scenarioUrl}");
        $this->info("Secret: {$secret}");
        $this->info("Next step (manual, unavoidable): open the scenario above, connect {$tenantModel->name}'s Facebook Page + lead form in the first module, then Activate.");

        return 0;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=OnboardFacebookBridgeCommandTest`
Expected: PASS, 6 tests.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: PASS, all tests (no regressions in existing Facebook/Make suites).

- [ ] **Step 6: Commit**

```bash
git add backend/app/Console/Commands/OnboardFacebookBridge.php backend/tests/Feature/OnboardFacebookBridgeCommandTest.php
git commit -m "feat: make:onboard-facebook-bridge command automates Make scenario provisioning"
```

---

### Task 3: Manual verification against the real Make API

This task has no automated test — it exists because nothing in Tasks 1-2 was verified against Make's
actual API (no live token was available while writing this plan), and this session already hit two
real surprises (a wrong module name, a stale route cache) that only surfaced by trying the real
thing. Do not consider this feature done until this task passes.

**Prerequisites:**
- A Make personal API token created per this plan's `.env.example` comment (Profile → API → "+ Add
  token", scopes `scenarios:read` + `scenarios:write` at minimum) — done by the user (autobizpro), not
  by this task.
- `MAKE_API_TOKEN` and `MAKE_TEAM_ID=1047106` set in production `backend/.env`.

- [ ] **Step 1: Deploy this branch to production**

Follow the deploy steps already documented in `HANDOFF.md`'s Track A/B sections: `git pull`,
`composer install`, `sudo -u www-data php artisan config:clear && config:cache`, **and**
`sudo -u www-data php artisan route:clear && route:cache` (this plan adds a new console command, not
a new route, so route caching isn't strictly required for this — but config caching IS, since the new
`MAKE_*` env vars are read through `config()`), `sudo systemctl restart php8.3-fpm`.

- [ ] **Step 2: Add the Make API token to production `.env`**

```bash
sudo nano ~/AutoBizPro-CRM/backend/.env
# add: MAKE_API_TOKEN=<the real token>
#      MAKE_TEAM_ID=1047106
sudo -u www-data php artisan config:clear && sudo -u www-data php artisan config:cache
```

- [ ] **Step 3: Run the command for a real tenant**

Pick a tenant that does NOT already have a live Make scenario (do not run this against sonia-crm —
it already has one built manually this session; running this command for sonia-crm would create a
second, duplicate scenario per this plan's known "Command re-run" gap). Use whichever of the 2-3
waiting customers is being onboarded next.

```bash
cd ~/AutoBizPro-CRM/backend && php artisan make:onboard-facebook-bridge <next-customer-subdomain>
```

Expected: exit code 0, prints a real `https://eu1.make.com/1047106/scenarios/<id>` URL, a secret, and
the manual next-step instruction.

- [ ] **Step 4: Open the printed URL and verify the scenario is well-formed**

In Make's UI, confirm: the scenario exists with the correct name, the HTTP module (module 2) has the
correct URL/header/body already filled in exactly as printed, and the trigger module (module 1) is
present but shows as needing a connection (this is expected — that's the one remaining manual step).

- [ ] **Step 5: Complete the one remaining manual step and verify a real lead**

Connect the customer's Facebook Page + form in module 1 (requires the customer's own consent, per a
short call — same step already done manually for sonia-crm this session), Activate, then submit a
test lead via Meta's Lead Ads Testing Tool
(https://developers.facebook.com/tools/lead-ads-testing/) and confirm it lands in the CRM as a real
`Lead` with `source = 'פייסבוק (Make)'` — same verification already proven to work for sonia-crm.

- [ ] **Step 6: Update HANDOFF.md**

Record in `HANDOFF.md`: which customer this was run for, that the command worked end-to-end (or what
had to be fixed if the wire-format guess in Task 1 was wrong — Make's exact API contract for
`blueprint`/`scheduling` as form-encoded JSON strings vs. nested JSON body was not verified against a
live token while writing this plan).
