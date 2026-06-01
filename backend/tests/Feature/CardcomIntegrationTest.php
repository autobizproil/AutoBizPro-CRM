<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use App\Services\Integrations\CardcomService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CardcomIntegrationTest extends TestCase
{
    use RefreshDatabase;

    // ─── helpers ──────────────────────────────────────────────────────────

    private function admin(string $sub = 'cc'): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $admin = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Admin',
            'email'     => "admin@{$sub}.test",
            'password'  => Hash::make('x'),
            'role'      => 'admin',
        ]);
        return [$tenant, $admin];
    }

    private function makeLead(int $tenantId): Lead
    {
        return Lead::create([
            'tenant_id' => $tenantId,
            'name'      => 'ישראל ישראלי',
            'phone'     => '0541234567',
            'email'     => 'israel@example.com',
            'status'    => 'new',
        ]);
    }

    // ─── settings masking ─────────────────────────────────────────────────

    public function test_settings_masks_cardcom_api_password(): void
    {
        [$tenant, $admin] = $this->admin('cc1');
        TenantSetting::create([
            'key'       => 'cardcom_api_password',
            'value'     => 'supersecret9876',
            'tenant_id' => $tenant->id,
        ]);

        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'cc1')
            ->getJson('/api/integrations/settings')
            ->assertOk()
            ->assertJsonPath('data.cardcom_api_password', '****9876');
    }

    public function test_saving_masked_password_does_not_overwrite(): void
    {
        [$tenant, $admin] = $this->admin('cc2');
        TenantSetting::create([
            'key'       => 'cardcom_api_password',
            'value'     => 'realpassword',
            'tenant_id' => $tenant->id,
        ]);

        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'cc2')
            ->putJson('/api/integrations/settings', ['cardcom_api_password' => '****word'])
            ->assertOk();

        $this->assertSame(
            'realpassword',
            TenantSetting::where('key', 'cardcom_api_password')->first()->value
        );
    }

    public function test_cardcom_terminal_and_api_name_are_in_integration_keys(): void
    {
        [$tenant, $admin] = $this->admin('cc3');

        // Save all three Cardcom keys
        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'cc3')
            ->putJson('/api/integrations/settings', [
                'cardcom_terminal'    => '12345',
                'cardcom_api_name'    => 'myuser',
                'cardcom_api_password'=> 'mypass',
            ])
            ->assertOk();

        // Read them back
        $resp = $this->actingAs($admin)
            ->withHeader('X-Tenant', 'cc3')
            ->getJson('/api/integrations/settings')
            ->assertOk();

        $resp->assertJsonPath('data.cardcom_terminal', '12345');
        $resp->assertJsonPath('data.cardcom_api_name', 'myuser');
        // password is masked
        $this->assertStringStartsWith('****', $resp->json('data.cardcom_api_password'));
    }

    // ─── isConfigured ────────────────────────────────────────────────────

    public function test_cardcom_service_not_configured_when_no_settings(): void
    {
        [$tenant] = $this->admin('cc4');
        // No settings stored → isConfigured() must return false
        app()->instance('current_tenant_id', $tenant->id);
        $svc = new CardcomService();
        $this->assertFalse($svc->isConfigured());
    }

    public function test_cardcom_service_configured_when_all_settings_present(): void
    {
        [$tenant] = $this->admin('cc5');
        app()->instance('current_tenant_id', $tenant->id);

        TenantSetting::create(['tenant_id' => $tenant->id, 'key' => 'cardcom_terminal',    'value' => '99999']);
        TenantSetting::create(['tenant_id' => $tenant->id, 'key' => 'cardcom_api_name',    'value' => 'apiuser']);
        TenantSetting::create(['tenant_id' => $tenant->id, 'key' => 'cardcom_api_password','value' => 'apipass']);

        $svc = new CardcomService();
        $this->assertTrue($svc->isConfigured());
    }

    // ─── createChargePage — not-configured path ────────────────────────

    public function test_create_charge_page_endpoint_returns_422_when_not_configured(): void
    {
        [$tenant, $admin] = $this->admin('cc6');
        $lead = $this->makeLead($tenant->id);

        // No Cardcom settings → service not configured
        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'cc6')
            ->postJson("/api/integrations/cardcom/lead/{$lead->id}", [
                'amount'      => 100,
                'description' => 'תשלום בדיקה',
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_create_charge_page_validates_required_fields(): void
    {
        [$tenant, $admin] = $this->admin('cc7');
        $lead = $this->makeLead($tenant->id);

        // Missing both fields
        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'cc7')
            ->postJson("/api/integrations/cardcom/lead/{$lead->id}", [])
            ->assertStatus(422);

        // Amount below minimum (< 1)
        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'cc7')
            ->postJson("/api/integrations/cardcom/lead/{$lead->id}", [
                'amount'      => 0,
                'description' => 'test',
            ])
            ->assertStatus(422);
    }

    public function test_create_charge_page_requires_leads_can_update_permission(): void
    {
        [$tenant, $admin] = $this->admin('cc8');
        $lead = $this->makeLead($tenant->id);

        // Agent role with can_update=false on leads — use a viewer
        $viewer = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Viewer',
            'email'     => 'viewer@cc8.test',
            'password'  => Hash::make('x'),
            'role'      => 'agent',
        ]);

        // Default agent permissions deny leads.can_update → 403
        $this->actingAs($viewer)
            ->withHeader('X-Tenant', 'cc8')
            ->postJson("/api/integrations/cardcom/lead/{$lead->id}", [
                'amount'      => 50,
                'description' => 'pay',
            ])
            ->assertStatus(403);
    }

    // ─── cardcomResult webhook ───────────────────────────────────────────

    public function test_result_webhook_returns_404_for_unknown_tenant(): void
    {
        $this->getJson('/api/integrations/cardcom/result/notexist?LowProfileCode=abc')
            ->assertStatus(404);

        $this->postJson('/api/integrations/cardcom/result/notexist', ['LowProfileCode' => 'abc'])
            ->assertStatus(404);
    }

    public function test_result_webhook_returns_422_when_missing_low_profile_code(): void
    {
        Tenant::create(['name' => 'T', 'subdomain' => 'cc9', 'status' => 'active']);

        $this->postJson('/api/integrations/cardcom/result/cc9', [])
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_result_webhook_logs_activity_on_lead_when_payment_verified(): void
    {
        [$tenant] = $this->admin('cc10');
        $lead = $this->makeLead($tenant->id);

        // Bind a mock into the container so app(CardcomService::class) returns it
        $mock = \Mockery::mock(CardcomService::class);
        $mock->shouldReceive('isConfigured')->andReturn(true);
        $mock->shouldReceive('getTransaction')->andReturn([
            'status'        => 'success',
            'response_code' => 0,
            'data'          => ['TotalPayments' => '250.00', 'ReturnValue' => (string) $lead->id],
            'message'       => null,
        ]);
        $this->instance(CardcomService::class, $mock);

        $this->postJson('/api/integrations/cardcom/result/cc10', [
            'LowProfileCode' => 'FAKE-LP-CODE-XYZ',
            'ReturnValue'    => (string) $lead->id,
        ])->assertOk()->assertJsonPath('success', true)->assertJsonPath('paid', true);

        $activity = Activity::where('entity_type', 'lead')
            ->where('entity_id', $lead->id)
            ->where('type', 'payment')
            ->first();

        $this->assertNotNull($activity);
        $this->assertStringContainsString('תשלום התקבל בהצלחה', $activity->body);
        $this->assertStringContainsString('FAKE-LP-CODE-XYZ', $activity->body);
    }

    public function test_result_webhook_logs_failed_payment_activity(): void
    {
        [$tenant] = $this->admin('cc11');
        $lead = $this->makeLead($tenant->id);

        $mock = \Mockery::mock(CardcomService::class);
        $mock->shouldReceive('isConfigured')->andReturn(true);
        $mock->shouldReceive('getTransaction')->andReturn([
            'status'        => 'error',
            'response_code' => 36,
            'data'          => ['ReturnValue' => (string) $lead->id],
            'message'       => 'Cardcom ResponseCode: 36',
        ]);
        $this->instance(CardcomService::class, $mock);

        $this->postJson('/api/integrations/cardcom/result/cc11', [
            'LowProfileCode' => 'FAILED-LP-CODE',
            'ReturnValue'    => (string) $lead->id,
        ])->assertOk()->assertJsonPath('paid', false);

        $activity = Activity::where('entity_type', 'lead')
            ->where('entity_id', $lead->id)
            ->where('type', 'payment')
            ->first();

        $this->assertNotNull($activity);
        $this->assertStringContainsString('תשלום נכשל', $activity->body);
    }

    public function test_result_webhook_ignores_cross_tenant_lead(): void
    {
        // Tenant A
        $tenantA = Tenant::create(['name' => 'A', 'subdomain' => 'cc12a', 'status' => 'active']);
        // Tenant B
        $tenantB = Tenant::create(['name' => 'B', 'subdomain' => 'cc12b', 'status' => 'active']);

        app()->instance('current_tenant_id', $tenantB->id);
        $leadB = Lead::create([
            'tenant_id' => $tenantB->id,
            'name'      => 'Bob',
            'phone'     => '0509999999',
            'status'    => 'new',
        ]);

        app()->instance('current_tenant_id', $tenantA->id);

        $mock = \Mockery::mock(CardcomService::class);
        $mock->shouldReceive('isConfigured')->andReturn(true);
        $mock->shouldReceive('getTransaction')->andReturn([
            'status'        => 'success',
            'response_code' => 0,
            // ReturnValue references a lead that belongs to a different tenant
            'data'          => ['ReturnValue' => (string) $leadB->id],
            'message'       => null,
        ]);
        $this->instance(CardcomService::class, $mock);

        // Webhook for tenant A but lead belongs to tenant B — no activity must be created
        $this->postJson('/api/integrations/cardcom/result/cc12a', [
            'LowProfileCode' => 'CROSS-LP',
            'ReturnValue'    => (string) $leadB->id,
        ])->assertOk();

        $this->assertSame(0, Activity::where('entity_id', $leadB->id)->count());
    }
}
