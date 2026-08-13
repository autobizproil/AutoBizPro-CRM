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
