<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $role): array
    {
        $tenant = Tenant::create(['name' => 'Test', 'subdomain' => 'test-' . $role, 'status' => 'active']);
        $user   = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Test',
            'email'     => "$role@test.com",
            'password'  => bcrypt('password'),
            'role'      => $role,
        ]);
        app()->instance('current_tenant_id', $tenant->id);
        return [$tenant, $user];
    }

    public function test_agent_cannot_delete_lead(): void
    {
        [$tenant, $agent] = $this->makeUser('agent');
        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'Test Lead', 'assigned_to' => $agent->id]);

        $response = $this->actingAs($agent)
            ->withHeaders(['HOST' => 'test-agent.crm.test'])
            ->deleteJson("/api/leads/{$lead->id}");

        $response->assertStatus(403);
    }

    public function test_manager_cannot_access_automations_write(): void
    {
        [$tenant, $manager] = $this->makeUser('manager');

        $response = $this->actingAs($manager)
            ->withHeaders(['HOST' => 'test-manager.crm.test'])
            ->postJson('/api/automations', [
                'name'         => 'Test Auto',
                'trigger_type' => 'lead_created',
                'actions'      => [['type' => 'send_email']],
            ]);

        $response->assertStatus(403);
    }

    public function test_admin_can_crud_leads(): void
    {
        [$tenant, $admin] = $this->makeUser('admin');

        $response = $this->actingAs($admin)
            ->withHeaders(['HOST' => 'test-admin.crm.test'])
            ->postJson('/api/leads', ['name' => 'New Lead']);

        $response->assertStatus(201);
    }
}
