<?php

namespace App\Services\Integrations;

use App\Models\Lead;
use App\Models\Tenant;
use App\Services\SettingsService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Facebook Lead Ads — receives leadgen webhooks, fetches lead data from Graph API,
 * creates a Lead in the CRM.
 *
 * Setup in Meta Business Suite:
 *   1. Create a Facebook App (type: Business)
 *   2. Add the "Lead Ads" product to the app
 *   3. Subscribe the page to leadgen webhook events
 *   4. Set webhook URL: /api/integrations/facebook/webhook/{tenant}
 *   5. Verify token: the value in config('services.facebook.verify_token') (FACEBOOK_VERIFY_TOKEN)
 *   6. Grant "leads_retrieval" permission
 */
class FacebookLeadAdsService
{
    private SettingsService $settings;

    public function __construct(SettingsService $settings)
    {
        $this->settings = $settings;
    }

    /**
     * Handle Facebook's webhook verification (GET challenge).
     */
    public function verifyWebhook(array $params): string|false
    {
        $verifyToken = config('services.facebook.verify_token');
        if (
            ($params['hub_mode'] ?? '') === 'subscribe' &&
            ($params['hub_verify_token'] ?? '') === $verifyToken &&
            !empty($verifyToken)
        ) {
            return $params['hub_challenge'] ?? '0';
        }
        return false;
    }

    /**
     * Process a leadgen webhook payload.
     * Facebook sends: { entry: [{ changes: [{ value: { leadgen_id, page_id } }] }] }
     */
    public function processWebhook(array $payload, int $tenantId): void
    {
        $pageAccessToken = $this->settings->get('facebook_page_access_token');

        if (!$pageAccessToken) {
            Log::warning('Facebook: no page access token connected', ['tenant' => $tenantId]);
            return;
        }

        foreach ($payload['entry'] ?? [] as $entry) {
            foreach ($entry['changes'] ?? [] as $change) {
                $leadgenId = $change['value']['leadgen_id'] ?? null;
                $formId    = $change['value']['form_id'] ?? null;
                if (!$leadgenId) continue;

                $leadData = $this->fetchLead($leadgenId, $pageAccessToken);
                if (!$leadData) continue;

                $this->upsertLead($leadData, $formId, $leadgenId, $tenantId);
            }
        }
    }

    /**
     * Verify the X-Hub-Signature-256 header sent by Facebook.
     */
    public function verifySignature(string $rawBody, string $signature): bool
    {
        $appSecret = config('services.facebook.client_secret');
        if (!$appSecret) return false;

        $expected = 'sha256=' . hash_hmac('sha256', $rawBody, $appSecret);
        return hash_equals($expected, $signature);
    }

    private function fetchLead(string $leadgenId, string $pageAccessToken): ?array
    {
        try {
            $response = Http::timeout(10)
                ->get("https://graph.facebook.com/v21.0/{$leadgenId}", [
                    'access_token' => $pageAccessToken,
                    'fields'       => 'field_data,created_time,ad_id,ad_name,form_id',
                ]);

            if (!$response->ok()) {
                // Graph API's shape for an expired/revoked token: OAuthException, code 190.
                // Flag it so the Settings screen can tell the tenant to reconnect, instead of
                // leads silently vanishing with no visible cause.
                if ($response->json('error.code') === 190) {
                    $this->settings->set('facebook_connection_status', 'needs_renewal');
                }
                Log::warning('Facebook: failed to fetch lead', ['id' => $leadgenId, 'status' => $response->status()]);
                return null;
            }

            return $response->json();
        } catch (\Throwable $e) {
            Log::error('Facebook: exception fetching lead', ['error' => $e->getMessage()]);
            return null;
        }
    }

    /**
     * Public so both the real-time webhook path (processWebhook above) and
     * FacebookOAuthService::backfillLeads() call the same dedup/mapping logic —
     * Graph's /{leadgenId} response and /{formId}/leads list items share the same
     * field_data/created_time shape, so one method safely serves both callers.
     *
     * $silent (default false) suppresses LeadObserver's webhook dispatch and
     * automation firing via saveQuietly() — same convention as ImportService's
     * backdating path. Only the historical backfill passes true; the real-time
     * webhook path must keep firing automations as it always has.
     */
    public function upsertLead(array $leadData, ?string $formId, string $leadgenId, int $tenantId, bool $silent = false): void
    {
        // Facebook retries webhook delivery on non-200 responses, so leadgen_id
        // is the reliable dedupe key — check it before falling back to phone.
        $alreadyProcessed = Lead::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('fb_leadgen_id', $leadgenId)
            ->exists();

        if ($alreadyProcessed) return;

        // field_data is an array of { name, values } objects
        $fields = [];
        foreach ($leadData['field_data'] ?? [] as $field) {
            $fields[strtolower($field['name'])] = $field['values'][0] ?? null;
        }

        $phone = $fields['phone_number'] ?? $fields['phone'] ?? $fields['טלפון'] ?? null;
        $name  = trim(($fields['full_name'] ?? '')
            ?: (($fields['first_name'] ?? '') . ' ' . ($fields['last_name'] ?? '')));
        $email = $fields['email'] ?? $fields['אימייל'] ?? null;

        // De-dupe by phone
        if ($phone) {
            $normalized = preg_replace('/\D/', '', $phone);
            $normalized = ltrim($normalized, '972');
            if (!str_starts_with($normalized, '0')) $normalized = '0' . $normalized;

            $exists = Lead::withoutGlobalScope('tenant')
                ->where('tenant_id', $tenantId)
                ->where('phone_normalized', $normalized)
                ->exists();

            if ($exists) return;
        }

        $attributes = [
            'tenant_id'     => $tenantId,
            'name'          => $name ?: 'Facebook Lead',
            'phone'         => $phone,
            'email'         => $email,
            'source'        => 'פייסבוק',
            'fb_leadgen_id' => $leadgenId,
            'status'        => 'NEW_LEAD',
            'notes'         => $formId ? "Form ID: {$formId}" : null,
        ];

        // Graph's created_time reflects when the lead actually came in — for backfilled
        // historical leads this can be months/years in the past, so use it as created_at
        // rather than letting Eloquent stamp "now". Never let a bad/missing value throw.
        $createdAt = null;
        if (!empty($leadData['created_time'])) {
            try {
                $createdAt = \Carbon\Carbon::parse($leadData['created_time']);
            } catch (\Throwable $e) {
                $createdAt = null;
            }
        }

        if ($silent) {
            $lead = new Lead($attributes);
            if ($createdAt) {
                $lead->created_at = $createdAt;
            }
            $lead->saveQuietly();
        } else {
            $lead = Lead::create($attributes);
            if ($createdAt) {
                $lead->created_at = $createdAt;
                $lead->saveQuietly(); // backdate only — must not re-fire the outgoing webhook
            }
        }
    }
}
