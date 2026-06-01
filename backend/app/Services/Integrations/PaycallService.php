<?php

namespace App\Services\Integrations;

use App\Models\Activity;
use App\Models\Lead;
use App\Services\PhoneNormalizer;
use App\Services\SettingsService;
use Illuminate\Support\Facades\Log;

/**
 * Paycall PBX integration.
 *
 * Ported from Taskey's paycall webhook handler. Paycall POSTs call metadata
 * (direction, caller, callee, duration, recording URL) to a public endpoint.
 * We resolve the lead by normalized phone and log a call Activity on its
 * timeline.
 *
 * Field aliases handled (Paycall sends inconsistent casing across versions):
 *   type / call_direction           — call direction
 *   caller_name / outbound_caller_id — caller phone (inbound/outbound)
 *   callee                           — destination (outbound)
 *   call_sec / Duration / duration   — seconds
 *   record / RecordURL / recordingPath — recording URL
 */
class PaycallService
{
    public function isEnabled(): bool
    {
        return app(SettingsService::class)->get('paycall_enabled') === '1';
    }

    /**
     * Process a Paycall webhook payload.
     *
     * @param  array  $payload  Raw POST fields from Paycall
     * @return array{status: string, lead_id: int|null, activity_id: int|null}
     */
    public function processWebhook(array $payload): array
    {
        // ── 1. Determine direction ────────────────────────────────────────
        $directionRaw = $payload['type'] ?? $payload['call_direction'] ?? '';
        $isInbound    = str_contains(strtolower($directionRaw), 'incom')
                     || str_contains(strtoupper($directionRaw), 'INBOUND');
        $direction    = $isInbound ? 'incoming' : 'outgoing';

        // ── 2. Extract raw phone number ───────────────────────────────────
        if ($isInbound) {
            // For inbound calls the external party is the caller
            $rawPhone = $payload['caller_name'] ?? $payload['caller'] ?? '';
        } else {
            // For outbound calls the external party is who we dialled
            $rawPhone = $payload['outbound_caller_id'] ?? $payload['callee'] ?? '';
        }

        // Strip the "11369" prefix Paycall sometimes prepends to callee
        $rawPhone = preg_replace('/^\D*11369/', '', (string) $rawPhone);

        // ── 3. Normalize phone ────────────────────────────────────────────
        $phone = PhoneNormalizer::normalize($rawPhone);

        if (empty($phone)) {
            Log::info('PaycallService: empty phone after normalize', ['payload' => $payload]);
            return ['status' => 'skipped', 'lead_id' => null, 'activity_id' => null];
        }

        // ── 4. Resolve lead by normalized phone ───────────────────────────
        $lead = Lead::where('phone_normalized', $phone)->first();

        // ── 5. Build activity body ────────────────────────────────────────
        $duration  = (int) ($payload['call_sec'] ?? $payload['Duration'] ?? $payload['duration'] ?? 0);
        $recordUrl = $payload['record'] ?? $payload['RecordURL'] ?? $payload['recordingPath'] ?? null;

        $body = "📞 שיחה {$direction} | {$duration}ש׳";
        if ($recordUrl) {
            $body .= "\n🎙 הקלטה: {$recordUrl}";
        }

        // ── 6. Create activity (only if lead found) ───────────────────────
        $activity = null;
        if ($lead) {
            $activity = Activity::create([
                'tenant_id'   => $lead->tenant_id,
                'entity_type' => 'lead',
                'entity_id'   => $lead->id,
                'type'        => 'call',
                'body'        => $body,
            ]);
        }

        Log::info('PaycallService: webhook processed', [
            'direction'   => $direction,
            'phone'       => $phone,
            'lead_id'     => $lead?->id,
            'activity_id' => $activity?->id,
            'duration'    => $duration,
        ]);

        return [
            'status'      => 'ok',
            'lead_id'     => $lead?->id,
            'activity_id' => $activity?->id,
        ];
    }
}
