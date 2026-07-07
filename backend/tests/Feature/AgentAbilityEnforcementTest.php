<?php

namespace Tests\Feature;

use App\Models\Automation;
use App\Models\Contact;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AgentAbilityEnforcementTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenant(string $sub): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'Admin', 'email' => "admin@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);

        return [$tenant, $admin, $sub];
    }

    private function issueToken(User $admin, string $sub, array $abilities): string
    {
        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/settings/api-tokens', ['name' => 'agent', 'abilities' => $abilities]);
        $resp->assertStatus(201);

        return $resp->json('data.token');
    }

    public function test_read_only_agent_token_blocked_from_writing_contacts(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('gap1');
        $plain = $this->issueToken($admin, $sub, ['crm:read']);
        auth()->forgetGuards();

        $this->withHeaders(['Authorization' => "Bearer $plain", 'X-Tenant' => $sub])
            ->getJson('/api/contacts')
            ->assertOk();

        $this->withHeaders(['Authorization' => "Bearer $plain", 'X-Tenant' => $sub])
            ->postJson('/api/contacts', ['name' => 'New Contact'])
            ->assertStatus(403);
    }

    public function test_full_agent_token_still_cannot_delete_contact_globally(): void
    {
        // crm:delete is never issued (validated set is crm:read/crm:write only) —
        // global inference must apply the red tier to EVERY module, not just leads.
        [$tenant, $admin, $sub] = $this->setupTenant('gap2');
        $contact = Contact::create(['tenant_id' => $tenant->id, 'name' => 'C']);
        $plain   = $this->issueToken($admin, $sub, ['crm:read', 'crm:write']);
        auth()->forgetGuards();

        $this->withHeaders(['Authorization' => "Bearer $plain", 'X-Tenant' => $sub])
            ->deleteJson("/api/contacts/{$contact->id}")
            ->assertStatus(403);

        $this->assertDatabaseHas('contacts', ['id' => $contact->id]);
    }

    public function test_write_token_can_manage_automations_but_not_delete(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('gap3');
        $plain = $this->issueToken($admin, $sub, ['crm:read', 'crm:write']);
        auth()->forgetGuards();

        $create = $this->withHeaders(['Authorization' => "Bearer $plain", 'X-Tenant' => $sub])
            ->postJson('/api/automations', [
                'name' => 'A', 'trigger_type' => 'lead_created', 'actions' => [['type' => 'send_email']],
            ]);
        $create->assertStatus(201);
        $id = $create->json('data.id');

        $this->withHeaders(['Authorization' => "Bearer $plain", 'X-Tenant' => $sub])
            ->putJson("/api/automations/{$id}", [
                'name' => 'A2', 'trigger_type' => 'lead_created', 'actions' => [['type' => 'send_email']],
            ])->assertOk();

        $this->withHeaders(['Authorization' => "Bearer $plain", 'X-Tenant' => $sub])
            ->deleteJson("/api/automations/{$id}")
            ->assertStatus(403);
    }

    public function test_leads_bulk_still_requires_crm_bulk_after_removing_per_route_tag(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('gap4');
        $plain = $this->issueToken($admin, $sub, ['crm:read', 'crm:write']);
        auth()->forgetGuards();

        $this->withHeaders(['Authorization' => "Bearer $plain", 'X-Tenant' => $sub])
            ->postJson('/api/leads/bulk', ['action' => 'delete', 'ids' => [999999]])
            ->assertStatus(403);
    }

    public function test_spa_session_unaffected_by_global_agent_ability_gate(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('gap5');
        $contact = Contact::create(['tenant_id' => $tenant->id, 'name' => 'C']);

        $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/contacts', ['name' => 'New'])
            ->assertStatus(201);

        $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->deleteJson("/api/contacts/{$contact->id}")
            ->assertStatus(200);
    }
}
