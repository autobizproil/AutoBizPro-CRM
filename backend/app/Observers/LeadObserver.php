<?php

namespace App\Observers;

use App\Jobs\SendOutgoingWebhook;
use App\Models\Lead;
use App\Services\SettingsService;

class LeadObserver
{
    // Model-event hook — fires for every entry point that persists a Lead via
    // Eloquent (LeadService, Facebook/Voicenter/WhatsApp/Paycall integrations,
    // CSV import, public forms), closing the gap where only LeadService's
    // manual call sites used to notify external agents.
    public function created(Lead $lead): void
    {
        $this->dispatch($lead, 'lead_created');
    }

    public function updated(Lead $lead): void
    {
        $event = match (true) {
            $lead->wasChanged('status')            => 'status_changed',
            $lead->wasChanged('pipeline_stage_id')  => 'stage_changed',
            default                                 => 'lead_updated',
        };

        $this->dispatch($lead, $event);
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
