<?php

namespace Tests\Feature;

use App\Models\Automation;
use App\Models\AutomationLog;
use App\Models\Lead;
use App\Models\PipelineStage;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BulkLeadAutomationTest extends TestCase
{
    use RefreshDatabase;

    public function test_bulk_change_stage_fires_automation_for_each_changed_lead(): void
    {
        $tenant = Tenant::create(['name' => 'Test', 'subdomain' => 'bulk-auto', 'status' => 'active']);
        $admin  = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Admin',
            'email'     => 'admin@bulk-auto.test',
            'password'  => bcrypt('password'),
            'role'      => 'admin',
        ]);
        app()->instance('current_tenant_id', $tenant->id);

        $fromStage = PipelineStage::create(['tenant_id' => $tenant->id, 'name' => 'From', 'position' => 1]);
        $toStage   = PipelineStage::create(['tenant_id' => $tenant->id, 'name' => 'To', 'position' => 2]);

        Automation::create([
            'tenant_id'    => $tenant->id,
            'name'         => 'Stage watcher',
            'trigger_type' => 'lead_stage_changed',
            'conditions'   => [['field' => 'pipeline_stage_id', 'operator' => '=', 'value' => $toStage->id]],
            'actions'      => [['type' => 'add_tag', 'tag' => 'moved']],
            'active'       => true,
        ]);

        $leadA = Lead::create(['tenant_id' => $tenant->id, 'name' => 'A', 'pipeline_stage_id' => $fromStage->id]);
        $leadB = Lead::create(['tenant_id' => $tenant->id, 'name' => 'B', 'pipeline_stage_id' => $fromStage->id]);
        // Already at the target stage — bulk update must not re-fire for this one.
        $leadC = Lead::create(['tenant_id' => $tenant->id, 'name' => 'C', 'pipeline_stage_id' => $toStage->id]);

        $response = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'bulk-auto'])
            ->postJson('/api/leads/bulk', [
                'action' => 'change_stage',
                'ids'    => [$leadA->id, $leadB->id, $leadC->id],
                'value'  => $toStage->id,
            ]);

        $response->assertStatus(200);

        $this->assertSame($toStage->id, $leadA->fresh()->pipeline_stage_id);
        $this->assertSame($toStage->id, $leadB->fresh()->pipeline_stage_id);

        // Only the two leads that actually changed stage should have fired the automation.
        $this->assertSame(2, AutomationLog::count());
        $firedFor = AutomationLog::pluck('entity_id')->sort()->values()->all();
        $this->assertSame([$leadA->id, $leadB->id], $firedFor);
    }
}
