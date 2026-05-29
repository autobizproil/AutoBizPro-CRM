<?php
namespace Tests\Feature;
use App\Models\Tenant;
use App\Models\User;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class GreenInvoiceTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $sub = 'gi'): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        return [$tenant, $admin, $sub];
    }

    public function test_test_connection_without_keys_returns_graceful_error(): void
    {
        [$t, $admin, $sub] = $this->admin();
        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/integrations/greeninvoice/test');
        $resp->assertOk();
        $resp->assertJson(['success' => false]); // no creds -> graceful failure, not a crash
    }

    public function test_save_and_get_settings_masks_secret(): void
    {
        [$t, $admin, $sub] = $this->admin('gi2');
        $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->putJson('/api/integrations/settings', [
                'greeninvoice_api_key_id'     => 'my-id',
                'greeninvoice_api_key_secret' => 'super-secret-1234',
            ])->assertOk();

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/integrations/settings');
        $resp->assertOk();
        $resp->assertJsonPath('data.greeninvoice_api_key_id', 'my-id');
        // Secret masked
        $this->assertSame('****1234', $resp->json('data.greeninvoice_api_key_secret'));
        // But the real secret persisted
        app()->instance('current_tenant_id', $t->id);
        $this->assertSame('super-secret-1234', app(SettingsService::class)->get('greeninvoice_api_key_secret'));
    }

    public function test_masked_secret_echo_does_not_overwrite(): void
    {
        [$t, $admin, $sub] = $this->admin('gi3');
        $svc = app(SettingsService::class);
        $svc->set('greeninvoice_api_key_secret', 'real-secret-9999');

        // Client sends back the masked value — must NOT overwrite the real secret
        $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->putJson('/api/integrations/settings', ['greeninvoice_api_key_secret' => '****9999'])
            ->assertOk();

        app()->instance('current_tenant_id', $t->id);
        $this->assertSame('real-secret-9999', app(SettingsService::class)->get('greeninvoice_api_key_secret'));
    }
}
