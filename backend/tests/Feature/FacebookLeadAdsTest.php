<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class FacebookLeadAdsTest extends TestCase
{
    use RefreshDatabase;

    private function tenantWithSettings(): Tenant
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        TenantSetting::create(['key' => 'facebook_app_id', 'value' => 'app123', 'tenant_id' => $tenant->id]);
        TenantSetting::create(['key' => 'facebook_app_secret', 'value' => 'secret456', 'tenant_id' => $tenant->id]);
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
}
