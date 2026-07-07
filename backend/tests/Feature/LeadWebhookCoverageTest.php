<?php

namespace Tests\Feature;

use App\Jobs\SendOutgoingWebhook;
use App\Models\Lead;
use App\Models\Tenant;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class LeadWebhookCoverageTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenant(string $sub): Tenant
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        app(SettingsService::class)->set('outgoing_webhook_url', 'https://n8n.example.test/webhook');

        return $tenant;
    }

    public function test_webhook_fires_on_plain_eloquent_create_bypassing_lead_service(): void
    {
        // Simulates FacebookLeadAdsService / VoicenterService / IntegrationsController / ImportService,
        // none of which go through LeadService — this is the coverage hole the observer must close.
        Http::fake();
        $this->setupTenant('cov1');

        Lead::create(['name' => 'FB Lead']);

        Http::assertSentCount(1);
        Http::assertSent(fn ($r) => $r['event'] === 'lead_created');
    }

    public function test_webhook_fires_on_plain_update_with_correct_event_name(): void
    {
        Http::fake();
        $tenant = $this->setupTenant('cov2');
        $lead   = Lead::create(['name' => 'L', 'status' => 'NEW_LEAD']);

        Http::fake(); // reset — ignore the creation call, isolate the update

        $lead->update(['status' => 'WON']);

        Http::assertSentCount(1);
        Http::assertSent(fn ($r) => $r['event'] === 'status_changed');
    }

    public function test_backdated_import_save_does_not_double_fire(): void
    {
        // Mirrors ImportService: Lead::create() then a save() that only backdates created_at.
        Http::fake();
        $this->setupTenant('cov3');

        $lead = Lead::create(['name' => 'Imported']);
        $lead->created_at = now()->subDays(3);
        $lead->saveQuietly();

        Http::assertSentCount(1); // created only — the backdate save must not re-fire
    }

    public function test_webhook_job_is_queued_not_executed_inline(): void
    {
        Queue::fake();
        $this->setupTenant('cov4');

        Lead::create(['name' => 'Queued Lead']);

        Queue::assertPushed(SendOutgoingWebhook::class);
    }
}
