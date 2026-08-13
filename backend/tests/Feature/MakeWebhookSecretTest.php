<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MakeWebhookSecretTest extends TestCase
{
    use RefreshDatabase;

    private function tenantAdmin(string $sub = 'acme'): array
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => $sub, 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Admin',
            'email'     => 'admin@acme.test',
            'password'  => bcrypt('x'),
            'role'      => 'admin',
        ]);
        return [$tenant, $user, $sub];
    }

    public function test_generate_creates_a_64_char_hex_secret_and_returns_it_once(): void
    {
        [, $user, $sub] = $this->tenantAdmin();

        $response = $this->actingAs($user)
            ->withHeader('X-Tenant', $sub)
            ->postJson('/api/integrations/make-webhook-secret/generate')
            ->assertOk()
            ->assertJson(['success' => true]);

        $secret = $response->json('data.secret');
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $secret);

        $stored = TenantSetting::where('key', 'make_lead_webhook_secret')->first();
        $this->assertSame($secret, $stored->value);
    }

    public function test_regenerating_rotates_the_secret(): void
    {
        [, $user, $sub] = $this->tenantAdmin('rotate-test');

        $first = $this->actingAs($user)
            ->withHeader('X-Tenant', $sub)
            ->postJson('/api/integrations/make-webhook-secret/generate')
            ->json('data.secret');

        $second = $this->actingAs($user)
            ->withHeader('X-Tenant', $sub)
            ->postJson('/api/integrations/make-webhook-secret/generate')
            ->json('data.secret');

        $this->assertNotSame($first, $second);
    }

    public function test_get_settings_returns_secret_masked(): void
    {
        [, $user, $sub] = $this->tenantAdmin('mask-test');

        $this->actingAs($user)
            ->withHeader('X-Tenant', $sub)
            ->postJson('/api/integrations/make-webhook-secret/generate');

        $response = $this->actingAs($user)
            ->withHeader('X-Tenant', $sub)
            ->getJson('/api/integrations/settings')
            ->assertOk();

        $masked = $response->json('data.make_lead_webhook_secret');
        $this->assertStringStartsWith('****', $masked);
        $this->assertSame(4, strlen($masked) - 4);
    }

    public function test_manual_write_via_save_settings_is_ignored(): void
    {
        [, $user, $sub] = $this->tenantAdmin('guard-test');

        $this->actingAs($user)
            ->withHeader('X-Tenant', $sub)
            ->putJson('/api/integrations/settings', ['make_lead_webhook_secret' => 'hand-typed-value'])
            ->assertOk();

        $this->assertNull(TenantSetting::where('key', 'make_lead_webhook_secret')->first());
    }
}
