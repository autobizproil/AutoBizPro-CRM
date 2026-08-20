<?php

namespace Tests\Feature;

use App\Services\Integrations\FacebookOAuthService;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class FacebookOAuthServiceTest extends TestCase
{
    use RefreshDatabase;

    private function service(): FacebookOAuthService
    {
        return app(FacebookOAuthService::class);
    }

    private function callBackfillLeads(FacebookOAuthService $svc, string $pageId, string $pageAccessToken, int $tenantId): void
    {
        $method = new \ReflectionMethod($svc, 'backfillLeads');
        $method->setAccessible(true);
        $method->invoke($svc, $pageId, $pageAccessToken, $tenantId);
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

    public function test_fetch_pages_skips_entries_missing_access_token_instead_of_throwing(): void
    {
        Http::fake([
            'graph.facebook.com/*/me/accounts*' => Http::response(['data' => [
                ['id' => '111', 'name' => 'Good Page', 'access_token' => 'page-token-111'],
                ['id' => '222', 'name' => 'No Access Page'], // missing access_token — should be skipped, not thrown
            ]], 200),
        ]);

        $pages = $this->service()->fetchPages('user-token-abc');

        $this->assertCount(1, $pages);
        $this->assertSame('111', $pages[0]['id']);
    }

    public function test_fetch_pages_returns_empty_array_when_user_manages_no_pages(): void
    {
        Http::fake(['graph.facebook.com/*/me/accounts*' => Http::response(['data' => []], 200)]);

        $this->assertSame([], $this->service()->fetchPages('user-token-abc'));
    }

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

    public function test_subscribe_page_returns_false_without_throwing_on_connection_exception(): void
    {
        Http::fake([
            'graph.facebook.com/*/subscribed_apps*' => fn () => throw new \Illuminate\Http\Client\ConnectionException('Connection timed out'),
        ]);

        $this->assertFalse($this->service()->subscribePage('111', 'page-token-111'));
    }

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

    private function settings(): SettingsService
    {
        return app(SettingsService::class);
    }

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
                && $request['permitted_tasks'] === '["ADVERTISE","MANAGE_LEADS"]'
                && $request['access_token'] === 'page-token-111';
        });
    }

    public function test_graph_post_best_effort_logs_failure_when_response_ok_but_success_false(): void
    {
        // Graph's agencies/managed_businesses endpoints return HTTP 200 with a
        // {"success": false} body on some failures — response->ok() alone would
        // miss this, silently treating it as success.
        config(['services.facebook.business_id' => 'our-biz-123']);
        Log::spy();
        Http::fake([
            'graph.facebook.com/*/managed_businesses*' => Http::response(['success' => true], 200),
            'graph.facebook.com/*/agencies*' => Http::response(['success' => false], 200),
        ]);

        $this->callDelegatePage($this->service(), '111', 'page-token-111', 'user-token-abc', 'client-biz-999');

        Log::shouldHaveReceived('warning')
            ->withArgs(fn ($message) => str_contains($message, 'agencies call failed'))
            ->once();
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

    public function test_backfill_form_leads_stops_when_data_empty_even_though_cursor_present(): void
    {
        // Meta's Graph API can keep handing back paging.cursors.after on a page whose
        // data is already empty — cursor presence alone is not a reliable "more pages"
        // signal. Empty data must terminate the loop regardless of the cursor.
        $tenant = \App\Models\Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);

        Http::fake([
            'graph.facebook.com/*/leadgen_forms*' => Http::response(['data' => [
                ['id' => 'form-1', 'name' => 'Contact Form', 'status' => 'ACTIVE'],
            ]], 200),
            'graph.facebook.com/*/form-1/leads*' => Http::response([
                'data'   => [],
                'paging' => ['cursors' => ['after' => 'some-cursor']],
            ], 200),
        ]);

        $this->callBackfillLeads($this->service(), '111', 'page-token-111', $tenant->id);

        Http::assertSentCount(2); // 1 leadgen_forms + 1 leads request, not infinite
    }

    public function test_backfill_form_leads_hard_cap_stops_pathological_infinite_pagination(): void
    {
        // Insurance on top of the empty-data check: even if every page keeps returning
        // non-empty data with a cursor forever, the loop must still stop.
        $tenant = \App\Models\Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);

        Http::fake([
            'graph.facebook.com/*/leadgen_forms*' => Http::response(['data' => [
                ['id' => 'form-1', 'name' => 'Contact Form', 'status' => 'ACTIVE'],
            ]], 200),
            'graph.facebook.com/*/form-1/leads*' => Http::response([
                'data' => [
                    ['id' => 'lg_cap', 'created_time' => '2026-08-01T10:00:00+0000', 'field_data' => []],
                ],
                'paging' => ['cursors' => ['after' => 'always-cursor']],
            ], 200),
        ]);

        $this->callBackfillLeads($this->service(), '111', 'page-token-111', $tenant->id);

        Http::assertSentCount(201); // 1 leadgen_forms + capped at 200 leads requests
    }
}
