<?php

namespace App\Observers;

use App\Jobs\SendOutgoingWebhook;
use App\Models\Lead;
use App\Services\AutomationEngine;
use App\Services\SettingsService;

class LeadObserver
{
    // Model-event hook — fires for every entry point that persists a Lead via
    // Eloquent (LeadService, Facebook/Voicenter/WhatsApp/Paycall integrations,
    // CSV import, public forms), closing the gap where only LeadService's
    // manual call sites used to notify external agents. Internal automation
    // triggers (lead_created/lead_stage_changed/lead_status_changed) are
    // fired here too, for the same reason — LeadService's own fire() calls
    // used to miss every one of those bypass paths.
    public function created(Lead $lead): void
    {
        $this->dispatch($lead, 'lead_created');
        app(AutomationEngine::class)->fire('lead_created', $lead);
    }

    public function updated(Lead $lead): void
    {
        $event = match (true) {
            $lead->wasChanged('status')            => 'status_changed',
            $lead->wasChanged('pipeline_stage_id')  => 'stage_changed',
            default                                 => 'lead_updated',
        };

        $this->dispatch($lead, $event);

        $automation = app(AutomationEngine::class);
        if ($lead->wasChanged('pipeline_stage_id')) {
            $automation->fire('lead_stage_changed', $lead);
        }
        if ($lead->wasChanged('status')) {
            $automation->fire('lead_status_changed', $lead);
        }
    }

    private function dispatch(Lead $lead, string $event): void
    {
        $settings   = app(SettingsService::class);
        $hasSetting = ! empty($settings->get('outgoing_webhook_url'));
        $hasEnv     = ! empty(config('services.webhook.target_url'));

        if (! $hasSetting && ! $hasEnv) {
            return;
        }

        SendOutgoingWebhook::dispatch($lead, $event);
    }
}
