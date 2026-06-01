<?php

namespace App\Jobs;

use App\Models\Lead;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SendOutgoingWebhook implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $timeout = 15;

    public function __construct(
        private Lead   $lead,
        private string $event,   // lead_created | lead_updated | status_changed | stage_changed
    ) {}

    public function handle(): void
    {
        // Per-tenant setting takes priority; fall back to global env config
        app()->instance('current_tenant_id', $this->lead->tenant_id);
        $url = app(\App\Services\SettingsService::class)->get('outgoing_webhook_url')
            ?: config('services.webhook.target_url');

        if (empty($url)) {
            return;
        }

        $this->lead->loadMissing(['stage', 'assignedUser']);

        $payload = [
            'event'      => $this->event,
            'tenant_id'  => $this->lead->tenant_id,
            'lead'       => [
                'id'          => $this->lead->id,
                'name'        => $this->lead->name,
                'phone'       => $this->lead->phone,
                'email'       => $this->lead->email,
                'status'      => $this->lead->status,
                'source'      => $this->lead->source,
                'notes'       => $this->lead->notes,
                'stage'       => $this->lead->stage?->only(['id', 'name', 'color']),
                'assigned_to' => $this->lead->assignedUser?->only(['id', 'name', 'email']),
                'created_at'  => $this->lead->created_at?->toIso8601String(),
                'updated_at'  => $this->lead->updated_at?->toIso8601String(),
            ],
            'timestamp'  => now()->toIso8601String(),
        ];

        try {
            Http::timeout($this->timeout)
                ->withHeaders(['Content-Type' => 'application/json', 'User-Agent' => 'AutoBizPro-CRM/1.0'])
                ->post($url, $payload);
        } catch (\Throwable $e) {
            Log::warning('Outgoing webhook failed', ['url' => $url, 'event' => $this->event, 'error' => $e->getMessage()]);
            throw $e; // let the queue retry
        }
    }
}
