<?php

namespace Tests\Feature;

use App\Jobs\SendOutgoingWebhook;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class FacebookLeadAdsTest extends TestCase
{
    use RefreshDatabase;

    private function tenantWithSettings(): Tenant
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        TenantSetting::create(['key' => 'facebook_page_access_token', 'value' => 'page-token-abc', 'tenant_id' => $tenant->id]);
        return $tenant;
    }

    private function leadgenPayload(string $leadgenId): array
    {
        return [
            'entry' => [[
                'changes' => [[
                    'value' => ['leadgen_id' => $leadgenId, 'form_id' => 'form789', 'page_id' => 'page1'],
                ]],
            ]],
        ];
    }

    public function test_webhook_creates_lead_with_leadgen_id(): void
    {
        $tenant = $this->tenantWithSettings();

        Http::fake([
            'graph.facebook.com/*' => Http::response([
                'field_data' => [
                    ['name' => 'full_name', 'values' => ['דני כהן']],
                    ['name' => 'phone_number', 'values' => ['0541234567']],
                ],
                'form_id' => 'form789',
            ], 200),
        ]);

        $this->postJson('/api/integrations/facebook/webhook/acme', $this->leadgenPayload('lg_001'))
            ->assertOk()
            ->assertJson(['success' => true]);

        $lead = Lead::where('fb_leadgen_id', 'lg_001')->first();
        $this->assertNotNull($lead);
        $this->assertSame($tenant->id, $lead->tenant_id);
        $this->assertSame('דני כהן', $lead->name);
        $this->assertSame('פייסבוק', $lead->source);
        $this->assertSame(1, Lead::count());
    }

    public function test_duplicate_leadgen_webhook_does_not_create_second_lead(): void
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

        $payload = $this->leadgenPayload('lg_002');

        $this->postJson('/api/integrations/facebook/webhook/acme', $payload)->assertOk();
        $this->postJson('/api/integrations/facebook/webhook/acme', $payload)->assertOk();

        $this->assertSame(1, Lead::count());
        Http::assertSentCount(2);
    }

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

    public function test_upsert_lead_with_silent_true_does_not_dispatch_outgoing_webhook(): void
    {
        // Backfilled historical leads must not trigger automations/webhooks — only
        // the real-time webhook path (silent=false, the default) should.
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        app(SettingsService::class)->set('outgoing_webhook_url', 'https://n8n.example.test/webhook');

        Queue::fake();

        $svc = app(\App\Services\Integrations\FacebookLeadAdsService::class);
        $svc->upsertLead([
            'field_data' => [
                ['name' => 'full_name', 'values' => ['Silent Backfill Lead']],
                ['name' => 'phone_number', 'values' => ['0501112222']],
            ],
        ], 'form-silent-1', 'lg_silent_1', $tenant->id, silent: true);

        $lead = Lead::where('fb_leadgen_id', 'lg_silent_1')->first();
        $this->assertNotNull($lead);
        Queue::assertNotPushed(SendOutgoingWebhook::class);
    }

    public function test_upsert_lead_with_silent_false_still_dispatches_outgoing_webhook(): void
    {
        // Regression guard: the real-time webhook path must keep firing exactly as before.
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        app(SettingsService::class)->set('outgoing_webhook_url', 'https://n8n.example.test/webhook');

        Queue::fake();

        $svc = app(\App\Services\Integrations\FacebookLeadAdsService::class);
        $svc->upsertLead([
            'field_data' => [
                ['name' => 'full_name', 'values' => ['Realtime Lead']],
                ['name' => 'phone_number', 'values' => ['0503334444']],
            ],
        ], 'form-realtime-1', 'lg_realtime_1', $tenant->id);

        Queue::assertPushed(SendOutgoingWebhook::class);
    }

    public function test_upsert_lead_uses_created_time_from_facebook_as_created_at(): void
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        $svc = app(\App\Services\Integrations\FacebookLeadAdsService::class);
        $svc->upsertLead([
            'created_time' => '2026-08-01T10:00:00+0000',
            'field_data'   => [
                ['name' => 'full_name', 'values' => ['Old Backfilled Lead']],
                ['name' => 'phone_number', 'values' => ['0505556666']],
            ],
        ], 'form-dated-1', 'lg_dated_1', $tenant->id, silent: true);

        $lead = Lead::where('fb_leadgen_id', 'lg_dated_1')->first();
        $this->assertNotNull($lead);
        $this->assertSame('2026-08-01 10:00:00', $lead->created_at->format('Y-m-d H:i:s'));
    }

    public function test_upsert_lead_without_created_time_defaults_to_now(): void
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        $svc = app(\App\Services\Integrations\FacebookLeadAdsService::class);
        $svc->upsertLead([
            'field_data' => [
                ['name' => 'full_name', 'values' => ['No Created Time Lead']],
                ['name' => 'phone_number', 'values' => ['0507778888']],
            ],
        ], 'form-nodate-1', 'lg_nodate_1', $tenant->id);

        $lead = Lead::where('fb_leadgen_id', 'lg_nodate_1')->first();
        $this->assertNotNull($lead);
        $this->assertTrue($lead->created_at->greaterThan(now()->subMinute()));
    }
}
