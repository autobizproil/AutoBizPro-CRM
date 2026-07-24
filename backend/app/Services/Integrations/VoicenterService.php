<?php

namespace App\Services\Integrations;

use App\Models\Activity;
use App\Models\Lead;
use App\Services\AutomationEngine;
use App\Services\PhoneNormalizer;
use App\Services\SettingsService;
use Illuminate\Support\Facades\Log;

/**
 * Voicenter PBX webhook integration.
 *
 * Voicenter sends POST webhooks on call events.
 * Typical payload fields: CallID, CallerID, Called, Duration, RecordingURL,
 *   Status (ANSWERED / NO ANSWER / BUSY), Direction (inbound / outbound),
 *   AgentExtension, AgentName.
 *
 * Setup in Voicenter portal → Integrations → Webhooks → add URL:
 *   /api/integrations/voicenter/webhook/{tenant}
 */
class VoicenterService
{
    public function __construct(
        private SettingsService $settings,
        private PhoneNormalizer $normalizer,
        private AutomationEngine $automation,
    ) {}

    public function processWebhook(array $payload, int $tenantId): void
    {
        // Verify shared secret if configured
        $secret = $this->settings->get('voicenter_webhook_secret');
        if ($secret && ($payload['secret'] ?? '') !== $secret) {
            Log::warning('Voicenter: invalid secret', ['tenant' => $tenantId]);
            return;
        }

        $direction = strtolower($payload['Direction'] ?? $payload['direction'] ?? 'inbound');
        $status    = strtoupper($payload['Status'] ?? $payload['status'] ?? 'ANSWERED');
        $callId    = $payload['CallID'] ?? $payload['call_id'] ?? null;
        $duration  = (int) ($payload['Duration'] ?? $payload['duration'] ?? 0);
        $recording = $payload['RecordingURL'] ?? $payload['recording_url'] ?? null;
        $agentName = $payload['AgentName'] ?? $payload['agent_name'] ?? null;

        // Determine the external (customer) phone
        $callerRaw = $direction === 'inbound'
            ? ($payload['CallerID'] ?? $payload['caller_id'] ?? null)
            : ($payload['Called'] ?? $payload['called'] ?? null);

        if (!$callerRaw) return;

        $phone = $this->normalizer->normalize($callerRaw);

        // Find existing lead by normalized phone
        $lead = Lead::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('phone_normalized', $phone)
            ->first();

        // Auto-create lead for inbound calls from unknown numbers
        if (!$lead && $direction === 'inbound') {
            $lead = Lead::create([
                'tenant_id' => $tenantId,
                'name'      => "ליד - {$callerRaw}",
                'phone'     => $callerRaw,
                'source'    => 'שיחה נכנסת',
                'status'    => 'NEW_LEAD',
            ]);
        }

        if (!$lead) return;

        $durationStr = $duration > 0 ? gmdate('i:s', $duration) : null;
        $statusHe    = match($status) {
            'ANSWERED'  => 'נענתה',
            'NO ANSWER' => 'לא נענתה',
            'BUSY'      => 'תפוס',
            default     => $status,
        };

        $body = implode(' · ', array_filter([
            $direction === 'inbound' ? 'שיחה נכנסת' : 'שיחה יוצאת',
            $statusHe,
            $durationStr ? "משך: {$durationStr}" : null,
            $agentName ? "נציג: {$agentName}" : null,
            $callId ? "ID: {$callId}" : null,
            $recording ? "הקלטה: {$recording}" : null,
        ]));

        Activity::create([
            'tenant_id'   => $tenantId,
            'entity_type' => 'lead',
            'entity_id'   => $lead->id,
            'type'        => 'call',
            'body'        => $body,
        ]);

        if ($direction === 'inbound') {
            $this->automation->fire('call_received', $lead);
        }
    }
}
