<?php

namespace Tests\Feature;

use App\Models\Automation;
use App\Models\AutomationLog;
use App\Models\Lead;
use App\Models\Tenant;
use App\Services\AutomationEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use App\Jobs\RunAutomationJob;
use Tests\TestCase;

class AutomationTest extends TestCase
{
    use RefreshDatabase;

    public function test_automation_fires_on_lead_created(): void
    {
        Bus::fake();

        $tenant = Tenant::create(['name' => 'Test', 'subdomain' => 'auto-test', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        Automation::create([
            'tenant_id'    => $tenant->id,
            'name'         => 'Welcome',
            'trigger_type' => 'lead_created',
            'conditions'   => [],
            'actions'      => [['type' => 'send_email']],
            'active'       => true,
        ]);

        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'Test Lead']);

        $engine = app(AutomationEngine::class);
        $engine->fire('lead_created', $lead);

        Bus::assertDispatchedAfterResponse(RunAutomationJob::class);
    }

    public function test_automation_condition_blocks_wrong_source(): void
    {
        Bus::fake();

        $tenant = Tenant::create(['name' => 'Test', 'subdomain' => 'auto-test2', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        Automation::create([
            'tenant_id'    => $tenant->id,
            'name'         => 'Facebook Only',
            'trigger_type' => 'lead_created',
            'conditions'   => [['field' => 'source', 'operator' => '=', 'value' => 'facebook']],
            'actions'      => [['type' => 'send_email']],
            'active'       => true,
        ]);

        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'Test Lead', 'source' => 'google']);

        $engine = app(AutomationEngine::class);
        $engine->fire('lead_created', $lead);

        Bus::assertNotDispatchedAfterResponse(RunAutomationJob::class);
    }

    public function test_client_created_automation_fires_on_lead_conversion(): void
    {
        // ClientController::convertLead is a separate creation path from
        // ClientController::store — both must fire client_created, not just store().
        Bus::fake();

        $tenant = Tenant::create(['name' => 'Test', 'subdomain' => 'convert-test', 'status' => 'active']);
        $admin  = \App\Models\User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Admin',
            'email'     => 'admin@convert-test.test',
            'password'  => bcrypt('password'),
            'role'      => 'admin',
        ]);
        app()->instance('current_tenant_id', $tenant->id);

        Automation::create([
            'tenant_id'    => $tenant->id,
            'name'         => 'New client',
            'trigger_type' => 'client_created',
            'conditions'   => [],
            'actions'      => [['type' => 'add_tag', 'tag' => 'converted']],
            'active'       => true,
        ]);

        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'Convert Me']);

        $response = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'convert-test'])
            ->postJson('/api/clients/convert-lead', ['lead_id' => $lead->id]);

        $response->assertStatus(201);
        Bus::assertDispatchedAfterResponse(RunAutomationJob::class);
    }

    public function test_form_submission_creates_lead(): void
    {
        $tenant = Tenant::create(['name' => 'Test', 'subdomain' => 'form-test', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        $form = \App\Models\Form::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Contact Form',
            'fields'    => [['label' => 'שם', 'type' => 'text', 'required' => true]],
            'active'    => true,
        ]);

        $response = $this->postJson("/api/forms/{$form->slug}/submit", [
            'name'  => 'Test User',
            'phone' => '0501234567',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('leads', [
            'tenant_id' => $tenant->id,
            'name'      => 'Test User',
        ]);
    }
}
