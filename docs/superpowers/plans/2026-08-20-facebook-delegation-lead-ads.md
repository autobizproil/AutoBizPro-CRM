# Facebook Delegation-Based Lead Ads Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Track A's dormant Facebook OAuth connect flow with Taskey's proven delegation
mechanism (Business Manager `managed_businesses`/`agencies` calls) and a historical lead backfill,
switching from the blocked `config_id` Configuration flow to classic OAuth scopes.

**Architecture:** Extend `FacebookOAuthService`/`FacebookOAuthController` in place (don't replace).
Add a `FACEBOOK_BUSINESS_ID` config value. `connectPage()` gains two new steps — `delegatePage()`
and `backfillLeads()` — both best-effort (log and continue, never throw). Backfill reuses
`FacebookLeadAdsService::upsertLead()` (made public) so real-time and backfilled leads share one
dedup/mapping code path.

**Tech Stack:** Laravel 11, Laravel Socialite (`facebook` driver), `Illuminate\Support\Facades\Http`
for Graph API calls, PHPUnit + `Http::fake()` for tests. No new frontend work — the existing
Settings redirect UX (`fb_status`, `fb_subscribed` query params) is unchanged.

## Global Constraints

- No live Facebook credentials or Business Manager id required to write or run any test in this
  plan — every Graph API call is `Http::fake()`d, matching the existing OAuth test suite.
- Every new/changed method must preserve tenant scoping via the `$tenantId` parameter already
  threaded through `connectPage()` and `processWebhook()` — no new tenant-scoping mechanism.
- `delegatePage()` and `backfillLeads()` must never throw past their own boundary — a delegation or
  backfill failure must not undo an otherwise-saved page connection (same invariant `subscribePage()`
  already follows).
- Ad Insights sync is explicitly out of scope — do not add `fb_ad_accounts`/`fb_campaign_insights`
  tables, sync jobs, or Graph calls beyond what's listed in this plan.
- No schema/migration changes — page connection state already lives in tenant-scoped
  `SettingsService` keys and `leads.fb_leadgen_id` (see spec §Tenant scoping).
- Spec: `docs/superpowers/specs/2026-08-20-facebook-delegation-lead-ads-design.md` — read it before
  touching any file in this plan if anything below is unclear.

---

### Task 1: Add `FACEBOOK_BUSINESS_ID` config

**Files:**
- Modify: `backend/config/services.php:42-47` (the `facebook` block)
- Modify: `backend/.env.example:68-74` (Facebook env vars block)
- Test: `backend/tests/Feature/FacebookOAuthSettingsTest.php`

**Interfaces:**
- Produces: `config('services.facebook.business_id')` — string|null, read by Task 4's
  `delegatePage()`.

- [ ] **Step 1: Read the existing settings test to confirm nothing else references the `facebook`
  config block in a way this addition could break**

Run: `grep -n "services.facebook" backend/tests/Feature/FacebookOAuthSettingsTest.php`
Expected: shows existing assertions on `client_id`/`client_secret`/etc — none reference `business_id`
yet, so no test currently fails; this task only adds new capability.

- [ ] **Step 2: Add the config key**

In `backend/config/services.php`, change:

```php
    'facebook' => [
        'client_id'     => env('FACEBOOK_APP_ID'),
        'client_secret' => env('FACEBOOK_APP_SECRET'),
        'redirect'      => env('FACEBOOK_REDIRECT_URI'),
        'verify_token'  => env('FACEBOOK_VERIFY_TOKEN'),
        'config_id'     => env('FACEBOOK_CONFIG_ID'),
    ],
```

to:

```php
    'facebook' => [
        'client_id'     => env('FACEBOOK_APP_ID'),
        'client_secret' => env('FACEBOOK_APP_SECRET'),
        'redirect'      => env('FACEBOOK_REDIRECT_URI'),
        'verify_token'  => env('FACEBOOK_VERIFY_TOKEN'),
        'config_id'     => env('FACEBOOK_CONFIG_ID'),
        'business_id'   => env('FACEBOOK_BUSINESS_ID'),
    ],
```

- [ ] **Step 3: Add the env var to `.env.example`**

In `backend/.env.example`, after line 74 (`FACEBOOK_CONFIG_ID=`), add:

```
FACEBOOK_BUSINESS_ID=
```

- [ ] **Step 4: Verify config loads correctly**

Run: `cd backend && php artisan config:clear && php artisan tinker --execute="echo config('services.facebook.business_id') === null ? 'OK: null by default' : 'FAIL';"`
Expected: `OK: null by default`

- [ ] **Step 5: Commit**

```bash
git add backend/config/services.php backend/.env.example
git commit -m "feat: add FACEBOOK_BUSINESS_ID config for delegation-based Lead Ads connect"
```

---

### Task 2: Switch OAuth redirect from `config_id` to classic scopes

**Files:**
- Modify: `backend/app/Http/Controllers/FacebookOAuthController.php:42-46`
- Test: `backend/tests/Feature/FacebookOAuthControllerTest.php`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — `redirect()`'s signature and return type (`RedirectResponse`) are
  unchanged; only the scopes/config_id it sends to Facebook change.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/Feature/FacebookOAuthControllerTest.php`, inside the `FacebookOAuthControllerTest`
class:

```php
    public function test_redirect_requests_classic_scopes_not_config_id(): void
    {
        [, $user] = $this->tenantAdmin();

        $response = $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->get('/api/integrations/facebook/oauth/redirect');

        $response->assertRedirect();
        $location = $response->headers->get('Location');
        $this->assertStringContainsString('scope=', $location);
        foreach (['ads_read', 'pages_show_list', 'leads_retrieval', 'pages_manage_ads', 'business_management', 'pages_read_user_content', 'pages_manage_metadata'] as $scope) {
            $this->assertStringContainsString($scope, urldecode($location));
        }
        $this->assertStringNotContainsString('config_id=', $location);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=test_redirect_requests_classic_scopes_not_config_id`
Expected: FAIL — current `redirect()` sends `config_id` and empty scopes, so `scope=` param is
absent/empty and `config_id=` is present.

- [ ] **Step 3: Update `redirect()`**

In `backend/app/Http/Controllers/FacebookOAuthController.php`, replace:

```php
        // This app's permissions (pages_manage_metadata, leads_retrieval) are gated behind
        // Facebook Login for Business's Configuration system, not classic OAuth scopes —
        // passing ->scopes() directly triggers "Invalid Scopes" instead of a permission
        // prompt. config_id carries the permission set instead; see the design doc's
        // "OAuth callback identity" section for the Task 6 redesign context this builds on.
        return Socialite::driver('facebook')
            ->stateless()
            ->setScopes([])
            ->with(['state' => $state, 'config_id' => config('services.facebook.config_id')])
            ->redirect();
```

with:

```php
        // Delegation-based connect (see docs/superpowers/specs/2026-08-20-facebook-delegation-lead-ads-design.md)
        // requests these permissions as classic OAuth scopes on AutoBizPro's own app, rather than
        // via the Facebook Login for Business config_id/Configuration picker that never surfaced
        // leads_retrieval/pages_manage_metadata as choosable (see that spec's "Open assumption"
        // section — this switch is the working hypothesis for what actually unblocks Meta, not a
        // confirmed fix).
        return Socialite::driver('facebook')
            ->stateless()
            ->setScopes([
                'ads_read',
                'pages_show_list',
                'leads_retrieval',
                'pages_manage_ads',
                'business_management',
                'pages_read_user_content',
                'pages_manage_metadata',
            ])
            ->with(['state' => $state])
            ->redirect();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=test_redirect_requests_classic_scopes_not_config_id`
Expected: PASS

- [ ] **Step 5: Run the full existing OAuth controller test suite to check for regressions**

Run: `cd backend && php artisan test --filter=FacebookOAuthControllerTest`
Expected: all tests PASS — no other test in this file asserts on `config_id` or `scope=`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Controllers/FacebookOAuthController.php backend/tests/Feature/FacebookOAuthControllerTest.php
git commit -m "feat: request classic Facebook OAuth scopes instead of config_id"
```

---

### Task 3: Include page's Business id in `fetchPages()`

**Files:**
- Modify: `backend/app/Services/Integrations/FacebookOAuthService.php:50-71` (`fetchPages()`)
- Test: `backend/tests/Feature/FacebookOAuthServiceTest.php`

**Interfaces:**
- Consumes: nothing new.
- Produces: `fetchPages(string $userAccessToken): array` — each page array now optionally has a
  `business_id` key (`?string`) alongside the existing `id`/`name`/`access_token`, present only when
  Facebook returns a `business.id` for that page. Task 5 (`delegatePage()`) consumes this key.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/Feature/FacebookOAuthServiceTest.php`:

```php
    public function test_fetch_pages_includes_business_id_when_present(): void
    {
        Http::fake([
            'graph.facebook.com/*/me/accounts*' => Http::response(['data' => [
                ['id' => '111', 'name' => 'Page With Business', 'access_token' => 'page-token-111', 'business' => ['id' => 'biz-999']],
                ['id' => '222', 'name' => 'Personal Page', 'access_token' => 'page-token-222'],
            ]], 200),
        ]);

        $pages = $this->service()->fetchPages('user-token-abc');

        $this->assertSame('biz-999', $pages[0]['business_id']);
        $this->assertArrayNotHasKey('business_id', $pages[1]);
    }

    public function test_fetch_pages_requests_business_field(): void
    {
        Http::fake(['graph.facebook.com/*/me/accounts*' => Http::response(['data' => []], 200)]);

        $this->service()->fetchPages('user-token-abc');

        Http::assertSent(fn ($request) => str_contains($request['fields'] ?? '', 'business'));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: the two new tests FAIL (`business_id` not present; `fields` param doesn't request `business`),
all pre-existing tests in this file still PASS.

- [ ] **Step 3: Update `fetchPages()`**

In `backend/app/Services/Integrations/FacebookOAuthService.php`, replace the whole method body:

```php
    public function fetchPages(string $userAccessToken): array
    {
        $response = Http::get('https://graph.facebook.com/v21.0/me/accounts', [
            'access_token' => $userAccessToken,
            'fields'       => 'id,name,access_token,business',
        ]);

        if (!$response->ok()) {
            Log::error('Facebook OAuth: /me/accounts failed', ['status' => $response->status(), 'body' => $response->body()]);
            return [];
        }

        $pages = array_filter(
            $response->json('data') ?? [],
            fn (array $p) => isset($p['id'], $p['name'], $p['access_token'])
        );

        return array_values(array_map(function (array $p) {
            $page = ['id' => $p['id'], 'name' => $p['name'], 'access_token' => $p['access_token']];
            if (isset($p['business']['id'])) {
                $page['business_id'] = $p['business']['id'];
            }
            return $page;
        }, $pages));
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: all PASS, including `test_fetch_pages_returns_id_name_and_page_token` (still asserts the
exact 3-key array for a page with no `business` field — unaffected since `business_id` is only added
when present).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Integrations/FacebookOAuthService.php backend/tests/Feature/FacebookOAuthServiceTest.php
git commit -m "feat: include page's Business id in fetchPages for delegation"
```

---

### Task 4: Make `FacebookLeadAdsService::upsertLead()` public for backfill reuse

**Files:**
- Modify: `backend/app/Services/Integrations/FacebookLeadAdsService.php:114`
- Test: `backend/tests/Feature/FacebookLeadAdsTest.php`

**Interfaces:**
- Consumes: nothing new.
- Produces: `public function upsertLead(array $leadData, ?string $formId, string $leadgenId, int $tenantId): void`
  — same signature as today's private method, just visibility changed. Task 6's `backfillLeads()`
  calls this directly: `app(FacebookLeadAdsService::class)->upsertLead($leadData, $formId, $leadData['id'], $tenantId)`.
  `$leadData` must contain a `field_data` array shaped like Graph API's `{name, values}` objects —
  identical shape whether it comes from the webhook's `fetchLead()` or from `/{formId}/leads` list
  items, which is what makes this reuse safe.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/Feature/FacebookLeadAdsTest.php`:

```php
    public function test_upsert_lead_is_callable_directly_and_creates_a_lead(): void
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        $svc = app(\App\Services\Integrations\FacebookLeadAdsService::class);
        $svc->upsertLead([
            'field_data' => [
                ['name' => 'full_name', 'values' => ['Direct Call Test']],
                ['name' => 'phone_number', 'values' => ['0509998888']],
            ],
        ], 'form-direct-1', 'lg_direct_1', $tenant->id);

        $lead = Lead::where('fb_leadgen_id', 'lg_direct_1')->first();
        $this->assertNotNull($lead);
        $this->assertSame('Direct Call Test', $lead->name);
        $this->assertSame($tenant->id, $lead->tenant_id);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=test_upsert_lead_is_callable_directly_and_creates_a_lead`
Expected: FAIL with a visibility error — `Call to private method App\Services\Integrations\FacebookLeadAdsService::upsertLead()`.

- [ ] **Step 3: Change visibility**

In `backend/app/Services/Integrations/FacebookLeadAdsService.php`, change:

```php
    private function upsertLead(array $leadData, ?string $formId, string $leadgenId, int $tenantId): void
```

to:

```php
    /**
     * Public so both the real-time webhook path (processWebhook above) and
     * FacebookOAuthService::backfillLeads() call the same dedup/mapping logic —
     * Graph's /{leadgenId} response and /{formId}/leads list items share the same
     * field_data/created_time shape, so one method safely serves both callers.
     */
    public function upsertLead(array $leadData, ?string $formId, string $leadgenId, int $tenantId): void
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=FacebookLeadAdsTest`
Expected: all PASS, including the new test and every pre-existing webhook-path test (unchanged
behavior, only visibility changed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Integrations/FacebookLeadAdsService.php backend/tests/Feature/FacebookLeadAdsTest.php
git commit -m "refactor: make FacebookLeadAdsService::upsertLead public for backfill reuse"
```

---

### Task 5: `FacebookOAuthService::delegatePage()`

**Files:**
- Modify: `backend/app/Services/Integrations/FacebookOAuthService.php` (add new private method after `subscribePage()`)
- Test: `backend/tests/Feature/FacebookOAuthServiceTest.php`

**Interfaces:**
- Consumes: `config('services.facebook.business_id')` (Task 1).
- Produces: `private function delegatePage(string $pageId, string $pageAccessToken, string $userAccessToken, ?string $clientBusinessId): void`
  — void, never throws. Task 7 calls this from `connectPage()`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/Feature/FacebookOAuthServiceTest.php`. These call `delegatePage()` via
reflection since it's private and has no public caller yet in this task:

```php
    private function callDelegatePage(FacebookOAuthService $svc, string $pageId, string $pageAccessToken, string $userAccessToken, ?string $clientBusinessId): void
    {
        $method = new \ReflectionMethod($svc, 'delegatePage');
        $method->setAccessible(true);
        $method->invoke($svc, $pageId, $pageAccessToken, $userAccessToken, $clientBusinessId);
    }

    public function test_delegate_page_calls_managed_businesses_and_agencies_when_client_business_id_present(): void
    {
        config(['services.facebook.business_id' => 'our-biz-123']);
        Http::fake([
            'graph.facebook.com/*/managed_businesses*' => Http::response(['success' => true], 200),
            'graph.facebook.com/*/agencies*' => Http::response(['success' => true], 200),
        ]);

        $this->callDelegatePage($this->service(), '111', 'page-token-111', 'user-token-abc', 'client-biz-999');

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'our-biz-123/managed_businesses')
                && $request->method() === 'POST'
                && $request['existing_client_business_id'] === 'client-biz-999'
                && $request['access_token'] === 'user-token-abc';
        });
        Http::assertSent(function ($request) {
            return str_contains($request->url(), '111/agencies')
                && $request->method() === 'POST'
                && $request['business'] === 'our-biz-123'
                && $request['permitted_tasks'] === ['ADVERTISE', 'MANAGE_LEADS']
                && $request['access_token'] === 'page-token-111';
        });
    }

    public function test_delegate_page_skips_both_calls_when_no_client_business_id(): void
    {
        config(['services.facebook.business_id' => 'our-biz-123']);
        Http::fake();

        $this->callDelegatePage($this->service(), '111', 'page-token-111', 'user-token-abc', null);

        Http::assertNothingSent();
    }

    public function test_delegate_page_does_not_throw_on_duplicated_asset_error(): void
    {
        config(['services.facebook.business_id' => 'our-biz-123']);
        Http::fake([
            'graph.facebook.com/*/managed_businesses*' => Http::response(['error' => ['message' => 'duplicated asset detected']], 400),
            'graph.facebook.com/*/agencies*' => Http::response(['error' => ['message' => 'duplicated asset detected']], 400),
        ]);

        $this->callDelegatePage($this->service(), '111', 'page-token-111', 'user-token-abc', 'client-biz-999');

        $this->assertTrue(true); // reaching here without an exception is the assertion
    }

    public function test_delegate_page_does_not_throw_on_unexpected_error(): void
    {
        config(['services.facebook.business_id' => 'our-biz-123']);
        Http::fake([
            'graph.facebook.com/*/managed_businesses*' => Http::response(['error' => ['message' => 'permission denied']], 403),
            'graph.facebook.com/*/agencies*' => fn () => throw new \Illuminate\Http\Client\ConnectionException('timeout'),
        ]);

        $this->callDelegatePage($this->service(), '111', 'page-token-111', 'user-token-abc', 'client-biz-999');

        $this->assertTrue(true);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: the 4 new tests FAIL — `ReflectionException: Method delegatePage does not exist`.

- [ ] **Step 3: Implement `delegatePage()`**

In `backend/app/Services/Integrations/FacebookOAuthService.php`, add this method after
`subscribePage()` (before `connectPage()`):

```php
    /**
     * Claim a delegated management relationship on the page's owning Business (if any),
     * granting this app's own pre-configured Business Manager (FACEBOOK_BUSINESS_ID)
     * lead-management access without a per-customer App Review relationship — see
     * docs/superpowers/specs/2026-08-20-facebook-delegation-lead-ads-design.md.
     * Never throws: a failed delegation must not undo an otherwise-saved connection, and
     * a page with no owning Business (personal page) simply has nothing to delegate.
     */
    private function delegatePage(string $pageId, string $pageAccessToken, string $userAccessToken, ?string $clientBusinessId): void
    {
        if (!$clientBusinessId) {
            return;
        }

        $ourBusinessId = config('services.facebook.business_id');
        if (!$ourBusinessId) {
            Log::warning('Facebook OAuth: skipping delegation, FACEBOOK_BUSINESS_ID not configured', ['page_id' => $pageId]);
            return;
        }

        $this->graphPostBestEffort(
            "https://graph.facebook.com/v21.0/{$ourBusinessId}/managed_businesses",
            ['existing_client_business_id' => $clientBusinessId, 'access_token' => $userAccessToken],
            'managed_businesses',
            $pageId
        );

        $this->graphPostBestEffort(
            "https://graph.facebook.com/v21.0/{$pageId}/agencies",
            ['business' => $ourBusinessId, 'permitted_tasks' => ['ADVERTISE', 'MANAGE_LEADS'], 'access_token' => $pageAccessToken],
            'agencies',
            $pageId
        );
    }

    /**
     * POST a delegation call, logging any non-2xx response except the expected
     * "duplicated asset" case (page already delegated — not a real failure), and
     * never letting a connection exception escape. Mirrors subscribePage()'s
     * response->ok() check so delegation failures are as debuggable as subscription
     * failures already are, while still honoring the "never throws" contract.
     */
    private function graphPostBestEffort(string $url, array $params, string $label, string $pageId): void
    {
        try {
            $response = Http::asForm()->post($url, $params);
            $message  = $response->json('error.message', '');
            if (!$response->ok() && !str_contains($message, 'duplicated asset')) {
                Log::warning("Facebook OAuth: {$label} call failed", ['page_id' => $pageId, 'status' => $response->status(), 'body' => $response->body()]);
            }
        } catch (\Throwable $e) {
            Log::warning("Facebook OAuth: {$label} call failed", ['page_id' => $pageId, 'error' => $e->getMessage()]);
        }
    }
```

Note: both calls go through the shared `graphPostBestEffort()` helper, which checks the response
status and logs failures (matching `subscribePage()`'s existing pattern) while treating a
"duplicated asset" error as expected/silent and never letting either call throw past this method —
satisfying the spec's "never throws, log and continue" requirement.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Integrations/FacebookOAuthService.php backend/tests/Feature/FacebookOAuthServiceTest.php
git commit -m "feat: add Business Manager delegation calls to FacebookOAuthService"
```

---

### Task 6: `FacebookOAuthService::backfillLeads()`

**Files:**
- Modify: `backend/app/Services/Integrations/FacebookOAuthService.php` (add new private method,
  inject `FacebookLeadAdsService` via constructor)
- Test: `backend/tests/Feature/FacebookOAuthServiceTest.php`

**Interfaces:**
- Consumes: `FacebookLeadAdsService::upsertLead()` (Task 4).
- Produces: `private function backfillLeads(string $pageId, string $pageAccessToken, int $tenantId): void`
  — void, never throws. Task 7 calls this from `connectPage()`.
- The constructor changes from `__construct(SettingsService $settings)` to
  `__construct(SettingsService $settings, FacebookLeadAdsService $leadAdsService)` — Laravel's
  container resolves this automatically everywhere `FacebookOAuthService` is type-hinted
  (`FacebookOAuthController` methods already receive it via method injection), so no call site
  needs manual updating. Tests that construct it directly (`$this->service()` helper in
  `FacebookOAuthServiceTest`) need updating — see Step 3.

- [ ] **Step 1: Write the failing tests**

Update the `service()` helper in `backend/tests/Feature/FacebookOAuthServiceTest.php`:

```php
    private function service(): FacebookOAuthService
    {
        return app(FacebookOAuthService::class);
    }
```

(Using `app()` instead of `new FacebookOAuthService(...)` so the container resolves the new
constructor dependency automatically — this one-line change is itself part of "the failing test"
setup, not yet a new test.)

Add a reflection helper and tests:

```php
    private function callBackfillLeads(FacebookOAuthService $svc, string $pageId, string $pageAccessToken, int $tenantId): void
    {
        $method = new \ReflectionMethod($svc, 'backfillLeads');
        $method->setAccessible(true);
        $method->invoke($svc, $pageId, $pageAccessToken, $tenantId);
    }

    public function test_backfill_leads_fetches_forms_and_creates_leads(): void
    {
        $tenant = \App\Models\Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);

        Http::fake([
            'graph.facebook.com/*/leadgen_forms*' => Http::response(['data' => [
                ['id' => 'form-1', 'name' => 'Contact Form', 'status' => 'ACTIVE'],
            ]], 200),
            'graph.facebook.com/*/form-1/leads*' => Http::response(['data' => [
                ['id' => 'lg_bf_1', 'created_time' => '2026-08-01T10:00:00+0000', 'field_data' => [
                    ['name' => 'full_name', 'values' => ['Backfilled Lead']],
                    ['name' => 'phone_number', 'values' => ['0521112222']],
                ]],
            ]], 200),
        ]);

        $this->callBackfillLeads($this->service(), '111', 'page-token-111', $tenant->id);

        $lead = \App\Models\Lead::where('fb_leadgen_id', 'lg_bf_1')->first();
        $this->assertNotNull($lead);
        $this->assertSame('Backfilled Lead', $lead->name);
        $this->assertSame($tenant->id, $lead->tenant_id);
    }

    public function test_backfill_leads_follows_pagination_cursor(): void
    {
        $tenant = \App\Models\Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);

        Http::fake([
            'graph.facebook.com/*/leadgen_forms*' => Http::response(['data' => [
                ['id' => 'form-1', 'name' => 'Contact Form', 'status' => 'ACTIVE'],
            ]], 200),
            'graph.facebook.com/*/form-1/leads?*after=cursor-2*' => Http::response(['data' => [
                ['id' => 'lg_page2', 'created_time' => '2026-08-02T10:00:00+0000', 'field_data' => [
                    ['name' => 'phone_number', 'values' => ['0523334444']],
                ]],
            ]], 200),
            'graph.facebook.com/*/form-1/leads*' => Http::response([
                'data' => [
                    ['id' => 'lg_page1', 'created_time' => '2026-08-01T10:00:00+0000', 'field_data' => [
                        ['name' => 'phone_number', 'values' => ['0521112222']],
                    ]],
                ],
                'paging' => ['cursors' => ['after' => 'cursor-2']],
            ], 200),
        ]);

        $this->callBackfillLeads($this->service(), '111', 'page-token-111', $tenant->id);

        $this->assertNotNull(\App\Models\Lead::where('fb_leadgen_id', 'lg_page1')->first());
        $this->assertNotNull(\App\Models\Lead::where('fb_leadgen_id', 'lg_page2')->first());
    }

    public function test_backfill_leads_continues_to_next_form_when_one_form_fetch_fails(): void
    {
        $tenant = \App\Models\Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);

        Http::fake([
            'graph.facebook.com/*/leadgen_forms*' => Http::response(['data' => [
                ['id' => 'form-bad', 'name' => 'Broken Form', 'status' => 'ACTIVE'],
                ['id' => 'form-good', 'name' => 'Good Form', 'status' => 'ACTIVE'],
            ]], 200),
            'graph.facebook.com/*/form-bad/leads*' => Http::response(['error' => ['message' => 'nope']], 400),
            'graph.facebook.com/*/form-good/leads*' => Http::response(['data' => [
                ['id' => 'lg_good', 'created_time' => '2026-08-01T10:00:00+0000', 'field_data' => [
                    ['name' => 'phone_number', 'values' => ['0529998888']],
                ]],
            ]], 200),
        ]);

        $this->callBackfillLeads($this->service(), '111', 'page-token-111', $tenant->id);

        $this->assertNotNull(\App\Models\Lead::where('fb_leadgen_id', 'lg_good')->first());
    }

    public function test_backfill_leads_does_not_throw_when_forms_fetch_fails(): void
    {
        $tenant = \App\Models\Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);

        Http::fake(['graph.facebook.com/*/leadgen_forms*' => Http::response(['error' => ['message' => 'nope']], 400)]);

        $this->callBackfillLeads($this->service(), '111', 'page-token-111', $tenant->id);

        $this->assertTrue(true);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: the new tests FAIL — `ReflectionException: Method backfillLeads does not exist` (and the
constructor signature change means `service()` still resolves fine via `app()` even before this
task's implementation exists, since the container only requires the class to exist, not the method).

- [ ] **Step 3: Update the constructor and implement `backfillLeads()`**

In `backend/app/Services/Integrations/FacebookOAuthService.php`, add the import and update the
constructor:

```php
use App\Services\SettingsService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class FacebookOAuthService
{
    private SettingsService $settings;
    private FacebookLeadAdsService $leadAdsService;

    public function __construct(SettingsService $settings, FacebookLeadAdsService $leadAdsService)
    {
        $this->settings = $settings;
        $this->leadAdsService = $leadAdsService;
    }
```

Add this method after `delegatePage()`:

```php
    /**
     * One-time sync of a page's existing lead forms and their historical leads on first
     * connect — Facebook's webhook only delivers leads generated after subscription, so
     * without this, everything captured before "Connect with Facebook" was clicked is lost.
     * Never throws: a failed or partial backfill must not undo an otherwise-saved connection.
     * Per-form failures don't abort the remaining forms.
     */
    private function backfillLeads(string $pageId, string $pageAccessToken, int $tenantId): void
    {
        try {
            $response = Http::get("https://graph.facebook.com/v21.0/{$pageId}/leadgen_forms", [
                'access_token' => $pageAccessToken,
                'fields'       => 'id,name,status',
                'limit'        => 50,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Facebook OAuth: leadgen_forms fetch failed', ['page_id' => $pageId, 'error' => $e->getMessage()]);
            return;
        }

        if (!$response->ok()) {
            Log::warning('Facebook OAuth: leadgen_forms fetch failed', ['page_id' => $pageId, 'status' => $response->status(), 'body' => $response->body()]);
            return;
        }

        foreach ($response->json('data') ?? [] as $form) {
            $this->backfillFormLeads($form['id'] ?? null, $pageAccessToken, $tenantId);
        }
    }

    private function backfillFormLeads(?string $formId, string $pageAccessToken, int $tenantId): void
    {
        if (!$formId) {
            return;
        }

        $params = ['access_token' => $pageAccessToken, 'fields' => 'id,created_time,field_data', 'limit' => 50];

        do {
            try {
                $response = Http::get("https://graph.facebook.com/v21.0/{$formId}/leads", $params);
            } catch (\Throwable $e) {
                Log::warning('Facebook OAuth: leads fetch failed', ['form_id' => $formId, 'error' => $e->getMessage()]);
                return;
            }

            if (!$response->ok()) {
                Log::warning('Facebook OAuth: leads fetch failed', ['form_id' => $formId, 'status' => $response->status(), 'body' => $response->body()]);
                return;
            }

            foreach ($response->json('data') ?? [] as $lead) {
                if (!isset($lead['id'])) {
                    continue;
                }
                $this->leadAdsService->upsertLead($lead, $formId, $lead['id'], $tenantId);
            }

            $after = $response->json('paging.cursors.after');
            $params['after'] = $after;
        } while ($after);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Integrations/FacebookOAuthService.php backend/tests/Feature/FacebookOAuthServiceTest.php
git commit -m "feat: add historical lead backfill to FacebookOAuthService"
```

---

### Task 7: Wire `delegatePage()` and `backfillLeads()` into `connectPage()`

**Files:**
- Modify: `backend/app/Services/Integrations/FacebookOAuthService.php:105-117` (`connectPage()`)
- Test: `backend/tests/Feature/FacebookOAuthServiceTest.php`, `backend/tests/Feature/FacebookOAuthControllerTest.php`

**Interfaces:**
- Consumes: `delegatePage()` (Task 5), `backfillLeads()` (Task 6) — both now called from within
  `connectPage()` rather than only reachable via reflection in tests.
- Produces: `connectPage(array $page, int $tenantId): array` — same signature and same return shape
  (`['page_name' => ..., 'subscribed' => bool]`) as today. `$page` array now optionally reads a
  `business_id` key (from Task 3's `fetchPages()`) if present.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/Feature/FacebookOAuthServiceTest.php`:

```php
    public function test_connect_page_delegates_and_backfills_when_business_id_present(): void
    {
        $tenant = \App\Models\Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        config(['services.facebook.business_id' => 'our-biz-123']);

        Http::fake([
            'graph.facebook.com/*/subscribed_apps*' => Http::response(['success' => true], 200),
            'graph.facebook.com/*/managed_businesses*' => Http::response(['success' => true], 200),
            'graph.facebook.com/*/agencies*' => Http::response(['success' => true], 200),
            'graph.facebook.com/*/leadgen_forms*' => Http::response(['data' => [
                ['id' => 'form-1', 'name' => 'Contact Form', 'status' => 'ACTIVE'],
            ]], 200),
            'graph.facebook.com/*/form-1/leads*' => Http::response(['data' => [
                ['id' => 'lg_connect_bf', 'created_time' => '2026-08-01T10:00:00+0000', 'field_data' => [
                    ['name' => 'phone_number', 'values' => ['0527778888']],
                ]],
            ]], 200),
        ]);

        $result = $this->service()->connectPage([
            'id' => '111', 'name' => 'AutoBizPro IL', 'access_token' => 'page-token-111',
            'business_id' => 'client-biz-999', 'user_access_token' => 'user-token-abc',
        ], $tenant->id);

        $this->assertSame(['page_name' => 'AutoBizPro IL', 'subscribed' => true], $result);
        Http::assertSent(fn ($request) => str_contains($request->url(), 'our-biz-123/managed_businesses'));
        Http::assertSent(fn ($request) => str_contains($request->url(), '111/agencies'));
        $this->assertNotNull(\App\Models\Lead::where('fb_leadgen_id', 'lg_connect_bf')->first());
    }

    public function test_connect_page_skips_delegation_when_page_has_no_business_id(): void
    {
        $tenant = \App\Models\Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        config(['services.facebook.business_id' => 'our-biz-123']);

        Http::fake([
            'graph.facebook.com/*/subscribed_apps*' => Http::response(['success' => true], 200),
            'graph.facebook.com/*/leadgen_forms*' => Http::response(['data' => []], 200),
        ]);

        $this->service()->connectPage(['id' => '111', 'name' => 'Personal Page', 'access_token' => 'page-token-111'], $tenant->id);

        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'managed_businesses'));
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'agencies'));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: `test_connect_page_delegates_and_backfills_when_business_id_present` FAILS (no delegation/
backfill calls sent yet, no lead created). `test_connect_page_skips_delegation_when_page_has_no_business_id`
currently PASSES already (nothing to skip yet) — that's fine, it's a regression guard for Step 3.

- [ ] **Step 3: Update `connectPage()`**

In `backend/app/Services/Integrations/FacebookOAuthService.php`, replace:

```php
    public function connectPage(array $page, int $tenantId): array
    {
        app()->instance('current_tenant_id', $tenantId);

        $this->settings->set('facebook_page_id', $page['id']);
        $this->settings->set('facebook_page_name', $page['name']);
        $this->settings->set('facebook_page_access_token', $page['access_token']);
        $this->settings->set('facebook_connection_status', null); // clear any prior needs_renewal flag

        $subscribed = $this->subscribePage($page['id'], $page['access_token']);

        return ['page_name' => $page['name'], 'subscribed' => $subscribed];
    }
```

with:

```php
    public function connectPage(array $page, int $tenantId): array
    {
        app()->instance('current_tenant_id', $tenantId);

        $this->settings->set('facebook_page_id', $page['id']);
        $this->settings->set('facebook_page_name', $page['name']);
        $this->settings->set('facebook_page_access_token', $page['access_token']);
        $this->settings->set('facebook_connection_status', null); // clear any prior needs_renewal flag

        $subscribed = $this->subscribePage($page['id'], $page['access_token']);

        if (isset($page['user_access_token'])) {
            $this->delegatePage($page['id'], $page['access_token'], $page['user_access_token'], $page['business_id'] ?? null);
        }

        $this->backfillLeads($page['id'], $page['access_token'], $tenantId);

        return ['page_name' => $page['name'], 'subscribed' => $subscribed];
    }
```

Note: `delegatePage()` is skipped entirely (not just its business-id check) when `user_access_token`
isn't present in `$page` — callers that don't have it (none currently do; this is forward-looking
for Task 8's caller wiring) simply get no delegation attempt rather than a missing-array-key error.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest`
Expected: all PASS.

- [ ] **Step 5: Run the full existing service + controller test suites to check for regressions**

Run: `cd backend && php artisan test --filter=FacebookOAuthServiceTest && php artisan test --filter=FacebookOAuthControllerTest`
Expected: all PASS — pre-existing `connectPage()` tests (`test_connect_page_persists_settings_and_subscribes`,
`test_connect_page_saves_settings_even_when_subscribe_fails`) call it without `business_id`/
`user_access_token` keys, exercising the "skip" paths added above; they must still pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Services/Integrations/FacebookOAuthService.php backend/tests/Feature/FacebookOAuthServiceTest.php
git commit -m "feat: wire delegation and backfill into connectPage"
```

---

### Task 8: Pass the user's long-lived token through to `connectPage()` at the real call sites

**Files:**
- Modify: `backend/app/Http/Controllers/FacebookOAuthController.php` (`callback()` and `selectPage()`)
- Test: `backend/tests/Feature/FacebookOAuthControllerTest.php`

**Interfaces:**
- Consumes: `connectPage()`'s `user_access_token` key (Task 7).
- Produces: nothing new — `callback()` and `selectPage()` keep their existing signatures and
  response shapes; they just thread one extra value into the `state`/`pages_token` payload and
  the `$page` array passed to `connectPage()`.

Currently `callback()` calls `$svc->connectPage($pages[0], $tenantId)` for the single-page case
(no long-lived token in the array — Task 7's skip-path handles this today), and for the multi-page
case, the long-lived token is never carried into `selectPage()`'s `pages_token` payload at all. Both
need the long-lived user token threaded through so real production connections actually delegate.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/Feature/FacebookOAuthControllerTest.php`:

```php
    public function test_callback_with_single_page_passes_user_token_for_delegation(): void
    {
        [$tenant] = $this->tenantAdmin();
        config(['services.facebook.business_id' => 'our-biz-123']);

        Socialite::shouldReceive('driver->stateless->user')->once()->andReturn($this->fakeSocialiteUser('short-lived-token'));
        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response(['access_token' => 'long-lived-token-xyz'], 200),
            'graph.facebook.com/*/me/accounts*' => Http::response(['data' => [
                ['id' => '111', 'name' => 'AutoBizPro IL', 'access_token' => 'page-token-111', 'business' => ['id' => 'client-biz-1']],
            ]], 200),
            'graph.facebook.com/*/subscribed_apps*' => Http::response(['success' => true], 200),
            'graph.facebook.com/*/managed_businesses*' => Http::response(['success' => true], 200),
            'graph.facebook.com/*/agencies*' => Http::response(['success' => true], 200),
            'graph.facebook.com/*/leadgen_forms*' => Http::response(['data' => []], 200),
        ]);

        $this->get('/api/integrations/facebook/oauth/callback?state=' . urlencode($this->stateFor($tenant->id)));

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'managed_businesses')
                && $request['access_token'] === 'long-lived-token-xyz';
        });
    }

    public function test_select_page_passes_user_token_for_delegation(): void
    {
        [$tenant] = $this->tenantAdmin();
        config(['services.facebook.business_id' => 'our-biz-123']);

        Http::fake([
            'graph.facebook.com/*/subscribed_apps*' => Http::response(['success' => true], 200),
            'graph.facebook.com/*/managed_businesses*' => Http::response(['success' => true], 200),
            'graph.facebook.com/*/agencies*' => Http::response(['success' => true], 200),
            'graph.facebook.com/*/leadgen_forms*' => Http::response(['data' => []], 200),
        ]);

        $pagesToken = Crypt::encryptString(json_encode([
            'tenant_id' => $tenant->id,
            'user_access_token' => 'long-lived-token-xyz',
            'pages' => [
                ['id' => '222', 'name' => 'Page Two', 'access_token' => 'page-token-222', 'business_id' => 'client-biz-2'],
            ],
            'expires_at' => now()->addMinutes(10)->timestamp,
        ]));

        $this->postJson('/api/integrations/facebook/oauth/select-page', ['pages_token' => $pagesToken, 'page_id' => '222'])
            ->assertOk();

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'managed_businesses')
                && $request['access_token'] === 'long-lived-token-xyz';
        });
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=FacebookOAuthControllerTest`
Expected: both new tests FAIL — no `managed_businesses` request is sent at all, since neither
`callback()` nor `selectPage()` currently passes `user_access_token`/`business_id` into the `$page`
array.

- [ ] **Step 3: Update `callback()`**

In `backend/app/Http/Controllers/FacebookOAuthController.php`, the single-page branch currently reads:

```php
        $result = $svc->connectPage($pages[0], $tenantId);
```

change to:

```php
        $result = $svc->connectPage($pages[0] + ['user_access_token' => $longLivedToken], $tenantId);
```

For the multi-page branch, the `$pagesToken` payload currently is:

```php
        if (count($pages) > 1) {
            $pagesToken = Crypt::encryptString(json_encode([
                'tenant_id'  => $tenantId,
                'pages'      => $pages,
                'expires_at' => now()->addSeconds(self::TOKEN_TTL_SECONDS)->timestamp,
            ]));
```

change to:

```php
        if (count($pages) > 1) {
            $pagesToken = Crypt::encryptString(json_encode([
                'tenant_id'          => $tenantId,
                'pages'              => $pages,
                'user_access_token'  => $longLivedToken,
                'expires_at'         => now()->addSeconds(self::TOKEN_TTL_SECONDS)->timestamp,
            ]));
```

- [ ] **Step 4: Update `selectPage()`**

Currently:

```php
        $result = $svc->connectPage($page, $payload['tenant_id']);
```

change to:

```php
        $result = $svc->connectPage($page + ['user_access_token' => $payload['user_access_token'] ?? null], $payload['tenant_id']);
```

Note: `$page` already carries `business_id` here since it comes straight from the `pages` array in
the decoded `pages_token` payload (Task 3's `fetchPages()` already includes it), no separate wiring
needed for that key. `?? null` guards a `pages_token` minted before this task shipped (rolling
deploy edge case) — `connectPage()`'s `isset($page['user_access_token'])` check (Task 7) already
treats a `null` value as "skip delegation", same as a missing key.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=FacebookOAuthControllerTest`
Expected: all PASS.

- [ ] **Step 6: Run the entire Facebook-related test suite for a final regression check**

Run: `cd backend && php artisan test --filter=FacebookOAuth && php artisan test --filter=FacebookLeadAds`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Http/Controllers/FacebookOAuthController.php backend/tests/Feature/FacebookOAuthControllerTest.php
git commit -m "feat: thread long-lived user token through to connectPage for delegation"
```

---

## Post-plan manual step (not part of this implementation)

Per the spec's "Blocking prerequisite": after this plan merges, code ships dormant-safe exactly like
Track A did. Activating it in production requires, outside this codebase:
1. A Business Manager AutoBizPro controls, set as `FACEBOOK_BUSINESS_ID` in production `.env`.
2. Confirming (live, against Meta) whether the classic-scopes OAuth flow surfaces
   `leads_retrieval`/`pages_manage_metadata` any better than the `config_id` flow did — may still
   require submitting standard App Review.
3. `sudo -u www-data php artisan config:clear && config:cache` on the server (same as every prior
   Facebook config change — see HANDOFF.md's Track A deploy notes).

No route cache action needed — this plan adds no new routes.
