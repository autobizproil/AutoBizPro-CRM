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
 *   5. Verify token: the value stored in facebook_verify_token setting
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
        $verifyToken = $this->settings->get('facebook_verify_token');
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
        $appId     = $this->settings->get('facebook_app_id');
        $appSecret = $this->settings->get('facebook_app_secret');

        if (!$appId || !$appSecret) {
            Log::warning('Facebook: missing app_id or app_secret', ['tenant' => $tenantId]);
            return;
        }

        foreach ($payload['entry'] ?? [] as $entry) {
            foreach ($entry['changes'] ?? [] as $change) {
                $leadgenId = $change['value']['leadgen_id'] ?? null;
                $formId    = $change['value']['form_id'] ?? null;
                if (!$leadgenId) continue;

                $leadData = $this->fetchLead($leadgenId, $appId, $appSecret);
                if (!$leadData) continue;

                $this->upsertLead($leadData, $formId, $tenantId);
            }
        }
    }

    /**
     * Verify the X-Hub-Signature-256 header sent by Facebook.
     */
    public function verifySignature(string $rawBody, string $signature): bool
    {
        $appSecret = $this->settings->get('facebook_app_secret');
        if (!$appSecret) return false;

        $expected = 'sha256=' . hash_hmac('sha256', $rawBody, $appSecret);
        return hash_equals($expected, $signature);
    }

    private function fetchLead(string $leadgenId, string $appId, string $appSecret): ?array
    {
        try {
            $token    = "{$appId}|{$appSecret}";
            $response = Http::timeout(10)
                ->get("https://graph.facebook.com/v19.0/{$leadgenId}", [
                    'access_token' => $token,
                    'fields'       => 'field_data,created_time,ad_id,ad_name,form_id',
                ]);

            if (!$response->ok()) {
                Log::warning('Facebook: failed to fetch lead', ['id' => $leadgenId, 'status' => $response->status()]);
                return null;
            }

            return $response->json();
        } catch (\Throwable $e) {
            Log::error('Facebook: exception fetching lead', ['error' => $e->getMessage()]);
            return null;
        }
    }

    private function upsertLead(array $leadData, ?string $formId, int $tenantId): void
    {
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

        Lead::create([
            'tenant_id' => $tenantId,
            'name'      => $name ?: 'Facebook Lead',
            'phone'     => $phone,
            'email'     => $email,
            'source'    => 'פייסבוק',
            'status'    => 'NEW_LEAD',
            'notes'     => $formId ? "Form ID: {$formId}" : null,
        ]);
    }
}
