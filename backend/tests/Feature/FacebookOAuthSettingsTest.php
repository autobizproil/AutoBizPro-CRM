<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FacebookOAuthSettingsTest extends TestCase
{
    use RefreshDatabase;

    private function tenantAdmin(): array
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create(['tenant_id' => $tenant->id, 'name' => 'Admin', 'email' => 'admin@acme.test', 'password' => bcrypt('x'), 'role' => 'admin']);
        return [$tenant, $user];
    }

    public function test_manual_app_credentials_are_no_longer_accepted(): void
    {
        [, $user] = $this->tenantAdmin();

        $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->putJson('/api/integrations/settings', [
                'facebook_app_id' => 'hand-typed-id',
                'facebook_app_secret' => 'hand-typed-secret',
                'facebook_verify_token' => 'hand-typed-token',
            ])
            ->assertOk();

        $this->assertNull(TenantSetting::where('key', 'facebook_app_id')->first());
        $this->assertNull(TenantSetting::where('key', 'facebook_app_secret')->first());
        $this->assertNull(TenantSetting::where('key', 'facebook_verify_token')->first());
    }

    public function test_page_access_token_cannot_be_set_by_hand(): void
    {
        [, $user] = $this->tenantAdmin();

        $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->putJson('/api/integrations/settings', [
                'facebook_page_access_token' => 'attacker-supplied-token',
            ])
            ->assertOk();

        $this->assertNull(TenantSetting::where('key', 'facebook_page_access_token')->first());
    }

    public function test_page_name_and_id_are_readable_after_oauth_writes_them(): void
    {
        [$tenant, $user] = $this->tenantAdmin();
        TenantSetting::create(['key' => 'facebook_page_id', 'value' => '123456', 'tenant_id' => $tenant->id]);
        TenantSetting::create(['key' => 'facebook_page_name', 'value' => 'AutoBizPro IL', 'tenant_id' => $tenant->id]);

        $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->getJson('/api/integrations/settings')
            ->assertOk()
            ->assertJsonPath('data.facebook_page_id', '123456')
            ->assertJsonPath('data.facebook_page_name', 'AutoBizPro IL');
    }
}
