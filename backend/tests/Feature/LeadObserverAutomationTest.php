<?php

namespace Tests\Feature;

use App\Jobs\RunAutomationJob;
use App\Models\Automation;
use App\Models\Lead;
use App\Models\PipelineStage;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Tests\TestCase;

class LeadObserverAutomationTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenant(string $sub): Tenant
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        return $tenant;
    }

    public function test_lead_created_automation_fires_for_plain_eloquent_create_bypassing_lead_service(): void
    {
        // Simulates FacebookLeadAdsService / VoicenterService / IntegrationsController / ImportService,
        // none of which go through LeadService — the exact gap LeadObserver was extended to close.
        Bus::fake();
        $tenant = $this->setupTenant('obs-created');

        Automation::create([
            'tenant_id'    => $tenant->id,
            'name'         => 'Welcome',
            'trigger_type' => 'lead_created',
            'conditions'   => [],
            'actions'      => [['type' => 'add_tag', 'tag' => 'welcomed']],
            'active'       => true,
        ]);

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'Bypass Lead']);

        Bus::assertDispatchedAfterResponse(RunAutomationJob::class);
    }

    public function test_lead_stage_changed_automation_fires_for_plain_eloquent_update_bypassing_lead_service(): void
    {
        Bus::fake();
        $tenant = $this->setupTenant('obs-updated');
        $stage  = PipelineStage::create(['tenant_id' => $tenant->id, 'name' => 'Won', 'position' => 1]);

        Automation::create([
            'tenant_id'    => $tenant->id,
            'name'         => 'Stage watcher',
            'trigger_type' => 'lead_stage_changed',
            'conditions'   => [['field' => 'pipeline_stage_id', 'operator' => '=', 'value' => $stage->id]],
            'actions'      => [['type' => 'add_tag', 'tag' => 'won']],
            'active'       => true,
        ]);

        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'Direct Update Lead']);
        Bus::fake(); // reset — ignore the creation call, isolate the stage-change fire
        // Plain Eloquent update — not via LeadService::changeStage().
        $lead->update(['pipeline_stage_id' => $stage->id]);

        Bus::assertDispatchedAfterResponse(RunAutomationJob::class);
    }

    public function test_backdated_save_quietly_does_not_fire_automation(): void
    {
        // Mirrors ImportService's backdating pattern — must not double-fire.
        Bus::fake();
        $tenant = $this->setupTenant('obs-quiet');

        Automation::create([
            'tenant_id'    => $tenant->id,
            'name'         => 'Welcome',
            'trigger_type' => 'lead_created',
            'conditions'   => [],
            'actions'      => [['type' => 'add_tag', 'tag' => 'welcomed']],
            'active'       => true,
        ]);

        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'Imported']);
        Bus::fake(); // reset — ignore the creation call, isolate the backdate save

        $lead->created_at = now()->subDays(3);
        $lead->saveQuietly();

        Bus::assertNotDispatchedAfterResponse(RunAutomationJob::class);
    }
}
