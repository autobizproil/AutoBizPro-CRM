<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\TenantSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WhatsappIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private function tenantUser(string $role = 'admin'): array
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create(['tenant_id' => $tenant->id, 'name' => 'Admin', 'email' => 'admin@acme.test', 'password' => bcrypt('x'), 'role' => $role]);
        return [$tenant, $user];
    }

    public function test_settings_masks_greenapi_token(): void
    {
        [$tenant, $user] = $this->tenantUser();
        TenantSetting::create(['key' => 'greenapi_token', 'value' => 'abcd1234token9999', 'tenant_id' => $tenant->id]);

        $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->getJson('/api/integrations/settings')
            ->assertOk()
            ->assertJsonPath('data.greenapi_token', '****9999');
    }

    public function test_saving_masked_token_does_not_overwrite(): void
    {
        [$tenant, $user] = $this->tenantUser();
        TenantSetting::create(['key' => 'greenapi_token', 'value' => 'realtoken', 'tenant_id' => $tenant->id]);

        $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->putJson('/api/integrations/settings', ['greenapi_token' => '****oken'])
            ->assertOk();

        $this->assertSame('realtoken', TenantSetting::where('key', 'greenapi_token')->first()->value);
    }

    public function test_webhook_creates_lead_and_logs_incoming_message(): void
    {
        [$tenant] = $this->tenantUser();

        $payload = [
            'typeWebhook' => 'incomingMessageReceived',
            'senderData'  => ['chatId' => '972541234567@c.us', 'senderName' => 'דני'],
            'messageData' => ['textMessageData' => ['textMessage' => 'שלום, מעוניין בדלת']],
        ];

        $this->postJson('/api/integrations/whatsapp/webhook/acme', $payload)
            ->assertOk()
            ->assertJson(['success' => true]);

        $lead = Lead::where('phone_normalized', '0541234567')->first();
        $this->assertNotNull($lead);
        $this->assertSame($tenant->id, $lead->tenant_id);
        $this->assertSame('דני', $lead->name);

        $activity = Activity::where('entity_type', 'lead')->where('entity_id', $lead->id)->first();
        $this->assertNotNull($activity);
        $this->assertSame('whatsapp', $activity->type);
        $this->assertStringContainsString('מעוניין בדלת', $activity->body);
    }

    public function test_webhook_ignores_group_and_non_incoming(): void
    {
        $this->tenantUser();

        // group chat
        $this->postJson('/api/integrations/whatsapp/webhook/acme', [
            'typeWebhook' => 'incomingMessageReceived',
            'senderData'  => ['chatId' => '120363000000000000@g.us'],
            'messageData' => ['textMessageData' => ['textMessage' => 'group msg']],
        ])->assertOk();

        // outgoing status
        $this->postJson('/api/integrations/whatsapp/webhook/acme', [
            'typeWebhook' => 'outgoingMessageStatus',
            'senderData'  => ['chatId' => '972541234567@c.us'],
        ])->assertOk();

        $this->assertSame(0, Lead::count());
    }

    public function test_webhook_unknown_tenant_returns_404(): void
    {
        $this->postJson('/api/integrations/whatsapp/webhook/nope', [
            'typeWebhook' => 'incomingMessageReceived',
            'senderData'  => ['chatId' => '972541234567@c.us'],
            'messageData' => ['textMessageData' => ['textMessage' => 'hi']],
        ])->assertStatus(404);
    }
}
