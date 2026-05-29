<?php
namespace Tests\Feature;
use App\Models\Lead;
use App\Models\PipelineStage;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class BulkLeadActionTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenant(string $sub = 'bulk'): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        return [$tenant, $admin, $sub];
    }

    public function test_bulk_change_stage(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant();
        $stage = PipelineStage::create(['tenant_id' => $tenant->id, 'name' => 'סגירה', 'color' => '#0a0', 'position' => 1]);
        $l1 = Lead::create(['tenant_id' => $tenant->id, 'name' => 'A']);
        $l2 = Lead::create(['tenant_id' => $tenant->id, 'name' => 'B']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/leads/bulk', [
                'action' => 'change_stage',
                'ids'    => [$l1->id, $l2->id],
                'value'  => $stage->id,
            ]);

        $resp->assertOk();
        $this->assertSame(2, $resp->json('data.affected'));
        $this->assertSame($stage->id, $l1->fresh()->pipeline_stage_id);
        $this->assertSame($stage->id, $l2->fresh()->pipeline_stage_id);
    }

    public function test_bulk_assign(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('bulk2');
        $agent = User::create(['tenant_id' => $tenant->id, 'name' => 'Ag', 'email' => 'ag@bulk2.co', 'password' => Hash::make('x'), 'role' => 'agent']);
        $l1 = Lead::create(['tenant_id' => $tenant->id, 'name' => 'A']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/leads/bulk', ['action' => 'assign', 'ids' => [$l1->id], 'value' => $agent->id]);

        $resp->assertOk();
        $this->assertSame($agent->id, $l1->fresh()->assigned_to);
    }

    public function test_bulk_delete(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('bulk3');
        $l1 = Lead::create(['tenant_id' => $tenant->id, 'name' => 'A']);
        $l2 = Lead::create(['tenant_id' => $tenant->id, 'name' => 'B']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/leads/bulk', ['action' => 'delete', 'ids' => [$l1->id, $l2->id]]);

        $resp->assertOk();
        $this->assertSame(0, Lead::count());
    }

    public function test_bulk_cannot_touch_other_tenant_leads(): void
    {
        [$tenantA, $adminA, $subA] = $this->setupTenant('bulk-a');
        $otherTenant = Tenant::create(['name' => 'O', 'subdomain' => 'bulk-o', 'status' => 'active']);
        $foreign = Lead::create(['tenant_id' => $otherTenant->id, 'name' => 'Foreign']);

        $resp = $this->actingAs($adminA)->withHeaders(['X-Tenant' => $subA])
            ->postJson('/api/leads/bulk', ['action' => 'delete', 'ids' => [$foreign->id]]);

        $resp->assertOk();
        $this->assertSame(0, $resp->json('data.affected')); // global scope blocks foreign lead
        app()->instance('current_tenant_id', $otherTenant->id);
        $this->assertSame(1, Lead::count()); // foreign lead untouched
    }
}
