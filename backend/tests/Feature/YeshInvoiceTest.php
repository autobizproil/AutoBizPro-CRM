<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use App\Services\Integrations\YeshInvoiceService;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class YeshInvoiceTest extends TestCase
{
    use RefreshDatabase;

    // ─── helpers ──────────────────────────────────────────────────────────

    private function admin(string $sub = 'yi'): array
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

    // ─── settings: key masking ─────────────────────────────────────────────

    public function test_settings_masks_yesh_secret_key(): void
    {
        [$tenant, $admin] = $this->admin('yi1');
        TenantSetting::create([
            'key'       => 'yesh_secret_key',
            'value'     => 'supersecretABCD',
            'tenant_id' => $tenant->id,
        ]);

        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'yi1')
            ->getJson('/api/integrations/settings')
            ->assertOk()
            ->assertJsonPath('data.yesh_secret_key', '****ABCD');
    }

    public function test_settings_masks_yesh_user_key(): void
    {
        [$tenant, $admin] = $this->admin('yi2');
        TenantSetting::create([
            'key'       => 'yesh_user_key',
            'value'     => 'userkey5678',
            'tenant_id' => $tenant->id,
        ]);

        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'yi2')
            ->getJson('/api/integrations/settings')
            ->assertOk()
            ->assertJsonPath('data.yesh_user_key', '****5678');
    }

    public function test_saving_masked_secret_key_does_not_overwrite(): void
    {
        [$tenant, $admin] = $this->admin('yi3');
        TenantSetting::create([
            'key'       => 'yesh_secret_key',
            'value'     => 'realSecretValue',
            'tenant_id' => $tenant->id,
        ]);

        // Client sends back the masked value — must NOT overwrite
        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'yi3')
            ->putJson('/api/integrations/settings', ['yesh_secret_key' => '****alue'])
            ->assertOk();

        $this->assertSame(
            'realSecretValue',
            TenantSetting::where('key', 'yesh_secret_key')->first()->value
        );
    }

    public function test_saving_masked_user_key_does_not_overwrite(): void
    {
        [$tenant, $admin] = $this->admin('yi4');
        TenantSetting::create([
            'key'       => 'yesh_user_key',
            'value'     => 'realUserKey1234',
            'tenant_id' => $tenant->id,
        ]);

        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'yi4')
            ->putJson('/api/integrations/settings', ['yesh_user_key' => '****1234'])
            ->assertOk();

        $this->assertSame(
            'realUserKey1234',
            TenantSetting::where('key', 'yesh_user_key')->first()->value
        );
    }

    // ─── save and retrieve keys ────────────────────────────────────────────

    public function test_yesh_keys_are_in_integration_keys(): void
    {
        [$tenant, $admin] = $this->admin('yi5');

        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'yi5')
            ->putJson('/api/integrations/settings', [
                'yesh_user_key'   => 'MY-USER-KEY',
                'yesh_secret_key' => 'MY-SECRET-KEY',
            ])
            ->assertOk();

        // Read back — both should be masked (ends_with _key)
        $resp = $this->actingAs($admin)
            ->withHeader('X-Tenant', 'yi5')
            ->getJson('/api/integrations/settings')
            ->assertOk();

        $this->assertStringStartsWith('****', $resp->json('data.yesh_user_key'));
        $this->assertStringStartsWith('****', $resp->json('data.yesh_secret_key'));

        // But the real values persisted
        app()->instance('current_tenant_id', $tenant->id);
        $svc = app(SettingsService::class);
        $this->assertSame('MY-USER-KEY',   $svc->get('yesh_user_key'));
        $this->assertSame('MY-SECRET-KEY', $svc->get('yesh_secret_key'));
    }

    // ─── YeshInvoiceService::isConfigured ─────────────────────────────────

    public function test_service_not_configured_when_no_settings(): void
    {
        [$tenant] = $this->admin('yi6');
        app()->instance('current_tenant_id', $tenant->id);

        $svc = new YeshInvoiceService();
        $this->assertFalse($svc->isConfigured());
    }

    public function test_service_configured_when_both_keys_present(): void
    {
        [$tenant] = $this->admin('yi7');
        app()->instance('current_tenant_id', $tenant->id);

        TenantSetting::create(['tenant_id' => $tenant->id, 'key' => 'yesh_user_key',   'value' => 'UKEY']);
        TenantSetting::create(['tenant_id' => $tenant->id, 'key' => 'yesh_secret_key', 'value' => 'SKEY']);

        $svc = new YeshInvoiceService();
        $this->assertTrue($svc->isConfigured());
    }

    // ─── testConnection — not configured path ─────────────────────────────

    public function test_test_connection_endpoint_returns_graceful_error_when_not_configured(): void
    {
        [$tenant, $admin] = $this->admin('yi8');

        // No keys stored
        $resp = $this->actingAs($admin)
            ->withHeader('X-Tenant', 'yi8')
            ->postJson('/api/integrations/yeshinvoice/test');

        $resp->assertOk();
        $resp->assertJsonPath('success', false);
        $this->assertStringContainsString('לא מוגדר', $resp->json('message'));
    }

    public function test_test_connection_without_keys_does_not_throw(): void
    {
        [$tenant] = $this->admin('yi9');
        app()->instance('current_tenant_id', $tenant->id);

        $svc    = new YeshInvoiceService();
        $result = $svc->testConnection();

        $this->assertSame('error', $result['status']);
        $this->assertIsString($result['message']);
        $this->assertNotEmpty($result['message']);
    }

    // ─── createInvoice — not configured path ──────────────────────────────

    public function test_service_create_invoice_returns_error_when_not_configured(): void
    {
        [$tenant] = $this->admin('yi10');
        app()->instance('current_tenant_id', $tenant->id);

        $svc = new YeshInvoiceService();
        $result = $svc->createInvoice([
            'items' => [['title' => 'Test', 'price' => 100, 'quantity' => 1]],
        ]);

        $this->assertSame('error', $result['status']);
        $this->assertNull($result['document_id']);
        $this->assertNull($result['url']);
        $this->assertIsString($result['message']);
    }

    // ─── HTTP endpoint — not configured ───────────────────────────────────

    public function test_create_invoice_endpoint_returns_422_when_not_configured(): void
    {
        [$tenant, $admin] = $this->admin('yi11');
        $lead = $this->makeLead($tenant->id);

        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'yi11')
            ->postJson("/api/integrations/yeshinvoice/lead/{$lead->id}", [
                'items' => [['title' => 'Service', 'price' => 500, 'quantity' => 1]],
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    // ─── HTTP endpoint — validation ───────────────────────────────────────

    public function test_create_invoice_endpoint_requires_items(): void
    {
        [$tenant, $admin] = $this->admin('yi12');
        $lead = $this->makeLead($tenant->id);

        // Missing items
        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'yi12')
            ->postJson("/api/integrations/yeshinvoice/lead/{$lead->id}", [])
            ->assertStatus(422);

        // Empty items array
        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'yi12')
            ->postJson("/api/integrations/yeshinvoice/lead/{$lead->id}", ['items' => []])
            ->assertStatus(422);
    }

    public function test_create_invoice_endpoint_requires_item_title_and_price(): void
    {
        [$tenant, $admin] = $this->admin('yi13');
        $lead = $this->makeLead($tenant->id);

        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'yi13')
            ->postJson("/api/integrations/yeshinvoice/lead/{$lead->id}", [
                'items' => [['price' => 100]], // missing title
            ])
            ->assertStatus(422);
    }

    // ─── HTTP endpoint — permission ───────────────────────────────────────

    public function test_create_invoice_requires_leads_can_update_permission(): void
    {
        [$tenant, $admin] = $this->admin('yi14');
        $lead = $this->makeLead($tenant->id);

        $viewer = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Viewer',
            'email'     => 'viewer@yi14.test',
            'password'  => Hash::make('x'),
            'role'      => 'agent', // default agent: leads.can_update = false
        ]);

        $this->actingAs($viewer)
            ->withHeader('X-Tenant', 'yi14')
            ->postJson("/api/integrations/yeshinvoice/lead/{$lead->id}", [
                'items' => [['title' => 'svc', 'price' => 100]],
            ])
            ->assertStatus(403);
    }

    public function test_yesh_invoice_test_requires_users_can_update_permission(): void
    {
        [$tenant, $admin] = $this->admin('yi15');

        $viewer = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Viewer',
            'email'     => 'viewer@yi15.test',
            'password'  => Hash::make('x'),
            'role'      => 'agent',
        ]);

        $this->actingAs($viewer)
            ->withHeader('X-Tenant', 'yi15')
            ->postJson('/api/integrations/yeshinvoice/test')
            ->assertStatus(403);
    }

    // ─── cross-tenant guard ───────────────────────────────────────────────

    public function test_create_invoice_endpoint_denies_cross_tenant_lead(): void
    {
        [$tenantA, $adminA] = $this->admin('yi16a');
        $tenantB = Tenant::create(['name' => 'B', 'subdomain' => 'yi16b', 'status' => 'active']);

        app()->instance('current_tenant_id', $tenantB->id);
        $leadB = Lead::create([
            'tenant_id' => $tenantB->id,
            'name'      => 'Bob',
            'phone'     => '0509999999',
            'status'    => 'new',
        ]);

        app()->instance('current_tenant_id', $tenantA->id);

        // Admin of tenant A tries to create invoice on tenant B's lead.
        // The HasTenantScope global scope scopes Lead queries to current_tenant_id,
        // so the route-model binding cannot find the lead → 404 (not 403).
        // This is the correct security behaviour — the resource is not visible at all.
        $this->actingAs($adminA)
            ->withHeader('X-Tenant', 'yi16a')
            ->postJson("/api/integrations/yeshinvoice/lead/{$leadB->id}", [
                'items' => [['title' => 'hack', 'price' => 1]],
            ])
            ->assertStatus(404);
    }

    // ─── success path (mocked) ────────────────────────────────────────────

    public function test_create_invoice_logs_activity_on_success(): void
    {
        [$tenant, $admin] = $this->admin('yi17');
        $lead = $this->makeLead($tenant->id);

        // Bind a mock so no real HTTP call goes out
        $mock = \Mockery::mock(YeshInvoiceService::class);
        $mock->shouldReceive('isConfigured')->andReturn(true);
        $mock->shouldReceive('createInvoice')->andReturn([
            'status'      => 'success',
            'document_id' => 'DOC-123',
            'url'         => 'https://api.yeshinvoice.co.il/pdf/DOC-123.pdf',
            'message'     => null,
        ]);
        // The controller calls `new YeshInvoiceService()` so we bind to the class
        $this->app->bind(YeshInvoiceService::class, fn() => $mock);

        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'yi17')
            ->postJson("/api/integrations/yeshinvoice/lead/{$lead->id}", [
                'title' => 'Test Invoice',
                'items' => [['title' => 'Service Fee', 'price' => 500, 'quantity' => 1]],
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.document_id', 'DOC-123');

        $activity = Activity::where('entity_type', 'lead')
            ->where('entity_id', $lead->id)
            ->where('type', 'note')
            ->first();

        $this->assertNotNull($activity);
        $this->assertStringContainsString('DOC-123', $activity->body);
        $this->assertStringContainsString('Yesh Invoice', $activity->body);
    }

    public function test_create_invoice_returns_422_on_api_error(): void
    {
        [$tenant, $admin] = $this->admin('yi18');
        $lead = $this->makeLead($tenant->id);

        $mock = \Mockery::mock(YeshInvoiceService::class);
        $mock->shouldReceive('isConfigured')->andReturn(true);
        $mock->shouldReceive('createInvoice')->andReturn([
            'status'      => 'error',
            'document_id' => null,
            'url'         => null,
            'message'     => 'שגיאת מסמך מהשרת',
        ]);
        $this->app->bind(YeshInvoiceService::class, fn() => $mock);

        $this->actingAs($admin)
            ->withHeader('X-Tenant', 'yi18')
            ->postJson("/api/integrations/yeshinvoice/lead/{$lead->id}", [
                'items' => [['title' => 'svc', 'price' => 100]],
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        // No activity should be created on failure
        $this->assertSame(0, Activity::where('entity_id', $lead->id)->count());
    }
}
