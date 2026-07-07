<?php

namespace Tests\Feature;

use App\Jobs\SendOutgoingWebhook;
use App\Models\Lead;
use App\Models\Tenant;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OutgoingWebhookSignatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_webhook_carries_hmac_signature_and_delivery_id(): void
    {
        Http::fake();

        $tenant = Tenant::create(['name' => 'T', 'subdomain' => 'hook1', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        app(SettingsService::class)->set('outgoing_webhook_url', 'https://n8n.example.test/webhook');
        app(SettingsService::class)->set('outgoing_webhook_secret', 'test-secret-123');

        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'L']);

        (new SendOutgoingWebhook($lead, 'lead_created'))->handle();

        Http::assertSent(function ($request) {
            $expected = 'sha256=' . hash_hmac('sha256', $request->body(), 'test-secret-123');

            return $request->hasHeader('X-Webhook-Signature', $expected)
                && $request->hasHeader('X-Delivery-Id')
                && ! empty($request['delivery_id'])
                && $request->header('X-Delivery-Id')[0] === $request['delivery_id'];
        });
    }

    public function test_webhook_without_secret_sends_unsigned_with_delivery_id(): void
    {
        Http::fake();

        $tenant = Tenant::create(['name' => 'T', 'subdomain' => 'hook2', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        app(SettingsService::class)->set('outgoing_webhook_url', 'https://n8n.example.test/webhook');

        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'L']);

        (new SendOutgoingWebhook($lead, 'lead_created'))->handle();

        Http::assertSent(function ($request) {
            return ! $request->hasHeader('X-Webhook-Signature')
                && $request->hasHeader('X-Delivery-Id');
        });
    }
}
