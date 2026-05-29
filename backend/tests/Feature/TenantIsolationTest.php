<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    private function makeTenantUser(string $subdomain, string $role = 'admin'): array
    {
        $tenant = Tenant::create([
            'name'      => "Tenant $subdomain",
            'subdomain' => $subdomain,
            'status'    => 'active',
        ]);

        $user = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Test User',
            'email'     => "user@$subdomain.test",
            'password'  => bcrypt('password'),
            'role'      => $role,
        ]);

        return [$tenant, $user];
    }

    public function test_user_cannot_read_leads_from_other_tenant(): void
    {
        [$tenantA, $userA] = $this->makeTenantUser('acme');
        [$tenantB, $userB] = $this->makeTenantUser('beta');

        app()->instance('current_tenant_id', $tenantB->id);
        Lead::create(['tenant_id' => $tenantB->id, 'name' => 'Beta Lead']);
        app()->forgetInstance('current_tenant_id');

        $response = $this->actingAs($userA)
            ->withHeaders(['HOST' => 'acme.crm.test'])
            ->getJson('/api/leads');

        $response->assertOk();
        $leads = $response->json('data.data');
        $this->assertEmpty($leads);
    }

    public function test_user_cannot_read_contacts_from_other_tenant(): void
    {
        [$tenantA, $userA] = $this->makeTenantUser('acme2');
        [$tenantB, $userB] = $this->makeTenantUser('beta2');

        app()->instance('current_tenant_id', $tenantB->id);
        Contact::create(['tenant_id' => $tenantB->id, 'name' => 'Beta Contact']);
        app()->forgetInstance('current_tenant_id');

        $response = $this->actingAs($userA)
            ->withHeaders(['HOST' => 'acme2.crm.test'])
            ->getJson('/api/contacts');

        $response->assertOk();
        $contacts = $response->json('data.data');
        $this->assertEmpty($contacts);
    }

    public function test_user_from_wrong_tenant_gets_403(): void
    {
        [$tenantA, $userA] = $this->makeTenantUser('acme3');
        [$tenantB, $userB] = $this->makeTenantUser('beta3');

        // userA authenticates but hits tenantB subdomain
        $response = $this->actingAs($userA)
            ->withHeaders(['HOST' => 'beta3.crm.test'])
            ->getJson('/api/leads');

        $response->assertStatus(403);
    }
}
