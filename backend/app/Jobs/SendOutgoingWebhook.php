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
        $settings = app(\App\Services\SettingsService::class);
        $url      = $settings->get('outgoing_webhook_url') ?: config('services.webhook.target_url');
        $secret   = $settings->get('outgoing_webhook_secret');

        if (empty($url)) {
            return;
        }

        $this->lead->loadMissing(['stage', 'assignedUser']);

        $payload = [
            'event'       => $this->event,
            // Idempotency key — consumers must dedupe on this, deliveries can repeat (queue retries)
            'delivery_id' => (string) \Illuminate\Support\Str::uuid(),
            'tenant_id'   => $this->lead->tenant_id,
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

        $body    = json_encode($payload, JSON_UNESCAPED_UNICODE);
        $headers = [
            'Content-Type'  => 'application/json',
            'User-Agent'    => 'AutoBizPro-CRM/1.0',
            'X-Delivery-Id' => $payload['delivery_id'],
        ];
        if (! empty($secret)) {
            // Signature over the exact raw body — consumers verify with hash_hmac('sha256', rawBody, secret)
            $headers['X-Webhook-Signature'] = 'sha256=' . hash_hmac('sha256', $body, $secret);
        }

        try {
            Http::timeout($this->timeout)
                ->withHeaders($headers)
                ->withBody($body, 'application/json')
                ->post($url);
        } catch (\Throwable $e) {
            Log::warning('Outgoing webhook failed', ['url' => $url, 'event' => $this->event, 'error' => $e->getMessage()]);
            throw $e; // let the queue retry
        }
    }
}
