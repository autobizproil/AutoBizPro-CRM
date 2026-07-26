<?php

namespace Tests\Feature;

use App\Models\RecordType;
use App\Models\SavedView;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SavedViewTest extends TestCase
{
    use RefreshDatabase;

    private function tenantAndUser(string $sub): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        $user   = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        return [$tenant, $user, $sub];
    }

    public function test_creates_and_lists_a_saved_view(): void
    {
        [$tenant, $user, $sub] = $this->tenantAndUser('sv-create');
        app()->instance('current_tenant_id', $tenant->id);

        $resp = $this->actingAs($user)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/saved-views', [
                'entity_type' => 'leads',
                'name'        => 'לידים חדשים',
                'conditions'  => [['field' => 'source', 'operator' => 'equals', 'value' => 'אתר']],
            ]);
        $resp->assertCreated();

        $list = $this->actingAs($user)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/saved-views?entity_type=leads');
        $list->assertOk();
        $this->assertCount(1, $list->json('data'));
        $this->assertSame('לידים חדשים', $list->json('data.0.name'));
    }

    public function test_list_only_returns_the_requesting_users_views(): void
    {
        [$tenant, $userA, $sub] = $this->tenantAndUser('sv-scope');
        $userB = User::create(['tenant_id' => $tenant->id, 'name' => 'B', 'email' => "b@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        app()->instance('current_tenant_id', $tenant->id);

        SavedView::create(['tenant_id' => $tenant->id, 'user_id' => $userA->id, 'entity_type' => 'leads', 'name' => 'A view']);
        SavedView::create(['tenant_id' => $tenant->id, 'user_id' => $userB->id, 'entity_type' => 'leads', 'name' => 'B view']);

        $resp = $this->actingAs($userA)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/saved-views?entity_type=leads');
        $resp->assertOk();
        $this->assertCount(1, $resp->json('data'));
        $this->assertSame('A view', $resp->json('data.0.name'));
    }

    public function test_user_cannot_update_or_delete_another_users_view(): void
    {
        [$tenant, $userA, $sub] = $this->tenantAndUser('sv-owner');
        $userB = User::create(['tenant_id' => $tenant->id, 'name' => 'B', 'email' => "b@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        app()->instance('current_tenant_id', $tenant->id);

        $view = SavedView::create(['tenant_id' => $tenant->id, 'user_id' => $userA->id, 'entity_type' => 'leads', 'name' => 'A view']);

        $this->actingAs($userB)->withHeaders(['X-Tenant' => $sub])
            ->putJson("/api/saved-views/{$view->id}", ['entity_type' => 'leads', 'name' => 'hijacked'])
            ->assertForbidden();

        $this->actingAs($userB)->withHeaders(['X-Tenant' => $sub])
            ->deleteJson("/api/saved-views/{$view->id}")
            ->assertForbidden();
    }

    public function test_set_default_unsets_the_previous_default_in_the_same_bucket(): void
    {
        [$tenant, $user, $sub] = $this->tenantAndUser('sv-default');
        app()->instance('current_tenant_id', $tenant->id);

        $viewA = SavedView::create(['tenant_id' => $tenant->id, 'user_id' => $user->id, 'entity_type' => 'leads', 'name' => 'A', 'is_default' => true]);
        $viewB = SavedView::create(['tenant_id' => $tenant->id, 'user_id' => $user->id, 'entity_type' => 'leads', 'name' => 'B']);

        $this->actingAs($user)->withHeaders(['X-Tenant' => $sub])
            ->postJson("/api/saved-views/{$viewB->id}/set-default")
            ->assertOk();

        $this->assertFalse($viewA->fresh()->is_default);
        $this->assertTrue($viewB->fresh()->is_default);
    }

    public function test_records_entity_requires_a_valid_entity_key(): void
    {
        [$tenant, $user, $sub] = $this->tenantAndUser('sv-records');
        app()->instance('current_tenant_id', $tenant->id);
        RecordType::create(['tenant_id' => $tenant->id, 'slug' => 'invoices', 'label' => 'חשבוניות', 'position' => 0]);

        $this->actingAs($user)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/saved-views', ['entity_type' => 'records', 'name' => 'no key'])
            ->assertStatus(422);

        $this->actingAs($user)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/saved-views', ['entity_type' => 'records', 'entity_key' => 'invoices', 'name' => 'ok'])
            ->assertCreated();

        $this->actingAs($user)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/saved-views', ['entity_type' => 'records', 'entity_key' => 'does-not-exist', 'name' => 'bad'])
            ->assertStatus(422);
    }
}
