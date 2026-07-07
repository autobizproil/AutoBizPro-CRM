<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ApiTokenTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenant(string $sub = 'tokens'): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'Admin', 'email' => "admin@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);

        return [$tenant, $admin, $sub];
    }

    private function createToken(User $admin, string $sub, array $abilities): array
    {
        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/settings/api-tokens', ['name' => 'n8n', 'abilities' => $abilities]);

        $resp->assertStatus(201);

        return [$resp->json('data.token'), $resp];
    }

    public function test_admin_creates_token_attached_to_service_user_not_admin(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant();

        [$plain, $resp] = $this->createToken($admin, $sub, ['crm:read']);

        $this->assertNotEmpty($plain);

        $serviceUser = User::where('tenant_id', $tenant->id)->where('is_service', true)->first();
        $this->assertNotNull($serviceUser, 'Service user was not created on demand');

        $tokenRow = $serviceUser->tokens()->first();
        $this->assertNotNull($tokenRow, 'Token not attached to service user');
        $this->assertNotSame($admin->id, $tokenRow->tokenable_id, 'Token must NOT belong to the admin');
    }

    public function test_non_privileged_user_cannot_create_token(): void
    {
        [$tenant, , $sub] = $this->setupTenant('tokens2');
        $agent = User::create(['tenant_id' => $tenant->id, 'name' => 'Agent', 'email' => "agent@$sub.co", 'password' => Hash::make('x'), 'role' => 'agent']);

        $this->actingAs($agent)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/settings/api-tokens', ['name' => 'n8n', 'abilities' => ['crm:read']])
            ->assertStatus(403);
    }

    public function test_invalid_ability_rejected(): void
    {
        [, $admin, $sub] = $this->setupTenant('tokens3');

        $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/settings/api-tokens', ['name' => 'n8n', 'abilities' => ['crm:admin']])
            ->assertStatus(422);
    }

    public function test_read_only_token_can_read_but_cannot_write(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('tokens4');
        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'L']);

        [$plain] = $this->createToken($admin, $sub, ['crm:read']);
        auth()->forgetGuards();

        $this->withHeaders(['Authorization' => "Bearer $plain", 'X-Tenant' => $sub])
            ->getJson('/api/leads')
            ->assertOk();

        $this->withHeaders(['Authorization' => "Bearer $plain", 'X-Tenant' => $sub])
            ->postJson("/api/leads/{$lead->id}/activities", ['type' => 'note', 'body' => 'triage'])
            ->assertStatus(403);
    }

    public function test_write_token_action_is_attributed_to_service_user_not_admin(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('tokens5');
        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'L']);

        [$plain] = $this->createToken($admin, $sub, ['crm:read', 'crm:write']);
        auth()->forgetGuards();

        $this->withHeaders(['Authorization' => "Bearer $plain", 'X-Tenant' => $sub])
            ->postJson("/api/leads/{$lead->id}/activities", ['type' => 'note', 'body' => 'triage verdict'])
            ->assertStatus(201);

        $serviceUser = User::where('tenant_id', $tenant->id)->where('is_service', true)->firstOrFail();

        // The strict assertion: activity logged under the service user, never the admin
        $this->assertDatabaseHas('activities', [
            'entity_type' => 'lead',
            'entity_id'   => $lead->id,
            'user_id'     => $serviceUser->id,
        ]);
        $this->assertDatabaseMissing('activities', [
            'entity_id' => $lead->id,
            'user_id'   => $admin->id,
        ]);
    }

    public function test_no_agent_token_can_reach_red_tier_routes(): void
    {
        // Red tier (roadmap): deletes and bulk are unreachable for ANY issuable token,
        // including full crm:read+crm:write — the required abilities are never issued
        [$tenant, $admin, $sub] = $this->setupTenant('tokens10');
        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'L']);

        [$plain] = $this->createToken($admin, $sub, ['crm:read', 'crm:write']);
        auth()->forgetGuards();

        $headers = ['Authorization' => "Bearer $plain", 'X-Tenant' => $sub];

        $this->withHeaders($headers)
            ->postJson('/api/leads/bulk', ['action' => 'delete', 'ids' => [$lead->id]])
            ->assertStatus(403);

        $this->withHeaders($headers)
            ->deleteJson("/api/leads/{$lead->id}")
            ->assertStatus(403);

        $this->withHeaders($headers)
            ->deleteJson('/api/leads/all/clear')
            ->assertStatus(403);

        $this->assertDatabaseHas('leads', ['id' => $lead->id]);
    }

    public function test_write_only_token_cannot_read(): void
    {
        [, $admin, $sub] = $this->setupTenant('tokens11');

        [$plain] = $this->createToken($admin, $sub, ['crm:write']);
        auth()->forgetGuards();

        $this->withHeaders(['Authorization' => "Bearer $plain", 'X-Tenant' => $sub])
            ->getJson('/api/leads')
            ->assertStatus(403);
    }

    public function test_revoked_token_stops_working(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('tokens6');

        [$plain] = $this->createToken($admin, $sub, ['crm:read']);

        $serviceUser = User::where('tenant_id', $tenant->id)->where('is_service', true)->firstOrFail();
        $tokenId = $serviceUser->tokens()->first()->id;

        $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->deleteJson("/api/settings/api-tokens/{$tokenId}")
            ->assertOk();
        auth()->forgetGuards();

        $this->withHeaders(['Authorization' => "Bearer $plain", 'X-Tenant' => $sub])
            ->getJson('/api/leads')
            ->assertStatus(401);
    }

    public function test_token_of_one_tenant_rejected_on_another_tenant(): void
    {
        [, $adminA, $subA] = $this->setupTenant('tokens7a');
        [$plainA] = $this->createToken($adminA, $subA, ['crm:read']);

        Tenant::create(['name' => 'B', 'subdomain' => 'tokens7b', 'status' => 'active']);
        auth()->forgetGuards();

        $this->withHeaders(['Authorization' => "Bearer $plainA", 'X-Tenant' => 'tokens7b'])
            ->getJson('/api/leads')
            ->assertStatus(403);
    }

    public function test_service_user_cannot_login(): void
    {
        // Service user created directly — a prior authenticated request in the same
        // test would flip the default guard to sanctum and break Auth::attempt (test-only artifact)
        [$tenant, , $sub] = $this->setupTenant('tokens8');
        $serviceUser = User::create([
            'tenant_id'  => $tenant->id,
            'name'       => 'Automation Agent',
            'email'      => 'agent-bot@service.internal',
            'password'   => Hash::make('known-password'),
            'role'       => 'admin',
            'status'     => 'active',
            'is_service' => true,
        ]);

        $this->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/auth/login', ['email' => $serviceUser->email, 'password' => 'known-password'])
            ->assertStatus(403);
    }

    public function test_spa_session_user_unaffected_by_ability_middleware(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('tokens9');
        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'L']);

        $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->postJson("/api/leads/{$lead->id}/activities", ['type' => 'note', 'body' => 'human note'])
            ->assertStatus(201);
    }
}
