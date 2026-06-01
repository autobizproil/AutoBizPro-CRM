<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaycallIntegrationTest extends TestCase
{
    use RefreshDatabase;

    // ─── helpers ──────────────────────────────────────────────────────────

    private function setupTenant(string $sub = 'pc'): array
    {
        $tenant = Tenant::create(['name' => 'PBX Corp', 'subdomain' => $sub, 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Admin',
            'email'     => "admin@{$sub}.test",
            'password'  => bcrypt('x'),
            'role'      => 'admin',
        ]);
        // Enable Paycall for this tenant by default
        TenantSetting::create(['tenant_id' => $tenant->id, 'key' => 'paycall_enabled', 'value' => '1']);
        return [$tenant, $user];
    }

    private function makeLead(int $tenantId, string $phone = '0541234567'): Lead
    {
        return Lead::create([
            'tenant_id' => $tenantId,
            'name'      => 'ישראל ישראלי',
            'phone'     => $phone,
            'status'    => 'new',
        ]);
    }

    // ─── inbound call ─────────────────────────────────────────────────────

    public function test_inbound_call_logs_activity_on_matched_lead(): void
    {
        [$tenant] = $this->setupTenant('pc1');
        $lead = $this->makeLead($tenant->id, '0541234567');

        $payload = [
            'callid'       => 'CALL-001',
            'type'         => 'INBOUND',
            'did'          => '0731234567',
            'caller'       => '101',
            'caller_name'  => '0541234567',   // external caller (inbound)
            'callee'       => '0731234567',
            'call_sec'     => '75',
            'start_date'   => '2026-06-01 10:00:00',
        ];

        $this->postJson('/api/integrations/paycall/webhook/pc1', $payload)
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'ok')
            ->assertJsonPath('data.lead_id', $lead->id);

        $activity = Activity::where('entity_type', 'lead')
            ->where('entity_id', $lead->id)
            ->where('type', 'call')
            ->first();

        $this->assertNotNull($activity);
        $this->assertStringContainsString('incoming', $activity->body);
        $this->assertStringContainsString('75', $activity->body);
        $this->assertSame($tenant->id, $activity->tenant_id);
    }

    // ─── outbound call ────────────────────────────────────────────────────

    public function test_outbound_call_logs_activity_on_correct_lead(): void
    {
        [$tenant] = $this->setupTenant('pc2');
        $lead = $this->makeLead($tenant->id, '0509876543');

        $payload = [
            'callid'              => 'CALL-002',
            'type'                => 'OUTBOUND',
            'caller'              => '102',
            'outbound_caller_id'  => '0509876543',  // who was dialled (outbound)
            'callee'              => '113690509876543',
            'Duration'            => '120',
            'RecordURL'           => 'https://pbx.example.com/recordings/call-002.mp3',
            'start_date'          => '2026-06-01 11:00:00',
        ];

        $this->postJson('/api/integrations/paycall/webhook/pc2', $payload)
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'ok')
            ->assertJsonPath('data.lead_id', $lead->id);

        $activity = Activity::where('entity_type', 'lead')
            ->where('entity_id', $lead->id)
            ->where('type', 'call')
            ->first();

        $this->assertNotNull($activity);
        $this->assertStringContainsString('outgoing', $activity->body);
        $this->assertStringContainsString('120', $activity->body);
        $this->assertStringContainsString('https://pbx.example.com/recordings/call-002.mp3', $activity->body);
    }

    // ─── call_direction alias ─────────────────────────────────────────────

    public function test_incoming_direction_via_call_direction_field(): void
    {
        [$tenant] = $this->setupTenant('pc3');
        $lead = $this->makeLead($tenant->id, '0521111111');

        $payload = [
            'callid'         => 'CALL-003',
            'call_direction' => 'incoming',
            'caller_name'    => '0521111111',
            'call_sec'       => '30',
        ];

        $this->postJson('/api/integrations/paycall/webhook/pc3', $payload)
            ->assertOk()
            ->assertJsonPath('data.status', 'ok');

        $activity = Activity::where('entity_id', $lead->id)->where('type', 'call')->first();
        $this->assertNotNull($activity);
        $this->assertStringContainsString('incoming', $activity->body);
    }

    // ─── paycall_enabled = 0 → skipped ───────────────────────────────────

    public function test_webhook_skipped_when_paycall_disabled(): void
    {
        [$tenant] = $this->setupTenant('pc4');
        // Override to disabled
        TenantSetting::where('tenant_id', $tenant->id)->where('key', 'paycall_enabled')->update(['value' => '0']);
        $this->makeLead($tenant->id, '0541234567');

        $this->postJson('/api/integrations/paycall/webhook/pc4', [
            'type'        => 'INBOUND',
            'caller_name' => '0541234567',
            'call_sec'    => '60',
        ])
            ->assertOk()
            ->assertJson(['success' => true])
            ->assertJsonMissing(['data']);

        $this->assertSame(0, Activity::count());
    }

    // ─── unknown tenant → 404 ────────────────────────────────────────────

    public function test_unknown_tenant_returns_404(): void
    {
        $this->postJson('/api/integrations/paycall/webhook/nope', [
            'type'        => 'INBOUND',
            'caller_name' => '0541234567',
        ])->assertStatus(404);
    }

    // ─── phone not in system → no crash ───────────────────────────────────

    public function test_unknown_phone_does_not_crash_and_returns_ok(): void
    {
        [$tenant] = $this->setupTenant('pc6');

        $this->postJson('/api/integrations/paycall/webhook/pc6', [
            'type'        => 'INBOUND',
            'caller_name' => '0599999999',  // not in DB
            'call_sec'    => '45',
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'ok')
            ->assertJsonPath('data.lead_id', null)
            ->assertJsonPath('data.activity_id', null);

        $this->assertSame(0, Activity::count());
    }

    // ─── optional secret verification ─────────────────────────────────────

    public function test_webhook_rejects_wrong_secret(): void
    {
        [$tenant] = $this->setupTenant('pc7');
        TenantSetting::create(['tenant_id' => $tenant->id, 'key' => 'paycall_secret', 'value' => 'correct-secret']);

        $this->withHeader('X-Paycall-Secret', 'wrong-secret')
            ->postJson('/api/integrations/paycall/webhook/pc7', [
                'type'        => 'INBOUND',
                'caller_name' => '0541234567',
            ])
            ->assertStatus(401);
    }

    public function test_webhook_accepts_correct_secret(): void
    {
        [$tenant] = $this->setupTenant('pc8');
        $lead = $this->makeLead($tenant->id, '0541234567');
        TenantSetting::create(['tenant_id' => $tenant->id, 'key' => 'paycall_secret', 'value' => 'my-secret']);

        $this->withHeader('X-Paycall-Secret', 'my-secret')
            ->postJson('/api/integrations/paycall/webhook/pc8', [
                'type'        => 'INBOUND',
                'caller_name' => '0541234567',
                'call_sec'    => '10',
            ])
            ->assertOk()
            ->assertJsonPath('data.lead_id', $lead->id);
    }

    // ─── paycall keys appear in integration settings ───────────────────────

    public function test_paycall_keys_are_in_integration_settings(): void
    {
        [$tenant, $admin] = $this->setupTenant('pc9');

        // Save all three paycall keys
        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'pc9')
            ->putJson('/api/integrations/settings', [
                'paycall_enabled' => '1',
                'paycall_did'     => '0731234567',
                'paycall_secret'  => 'super-secret',
            ])
            ->assertOk();

        $resp = $this->actingAs($admin)
            ->withHeader('X-Tenant', 'pc9')
            ->getJson('/api/integrations/settings')
            ->assertOk();

        $resp->assertJsonPath('data.paycall_enabled', '1');
        $resp->assertJsonPath('data.paycall_did', '0731234567');
        // secret is masked
        $this->assertStringStartsWith('****', $resp->json('data.paycall_secret'));
    }
}
