<?php

namespace App\Services\Integrations;

use App\Services\SettingsService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Facebook Lead Ads — OAuth connect flow. Exchanges the code Socialite hands back
 * for a long-lived Page access token, lists the user's Pages, and subscribes the
 * chosen Page to our app's leadgen webhook (the step with no reliable manual UI —
 * see docs/superpowers/specs/2026-08-11-facebook-oauth-lead-ads-design.md).
 */
class FacebookOAuthService
{
    private SettingsService $settings;
    private FacebookLeadAdsService $leadAdsService;

    public function __construct(SettingsService $settings, FacebookLeadAdsService $leadAdsService)
    {
        $this->settings = $settings;
        $this->leadAdsService = $leadAdsService;
    }

    /**
     * Exchange a short-lived user token (~1-2 hours) for a long-lived one (~60 days).
     * Page tokens derived from a long-lived user token don't expire on their own.
     */
    public function exchangeLongLivedToken(string $shortLivedToken): string
    {
        $response = Http::get('https://graph.facebook.com/v21.0/oauth/access_token', [
            'grant_type'        => 'fb_exchange_token',
            'client_id'         => config('services.facebook.client_id'),
            'client_secret'     => config('services.facebook.client_secret'),
            'fb_exchange_token' => $shortLivedToken,
        ]);

        if (!$response->ok() || !$response->json('access_token')) {
            Log::error('Facebook OAuth: long-lived token exchange failed', ['status' => $response->status(), 'body' => $response->body()]);
            throw new \RuntimeException('Facebook long-lived token exchange failed');
        }

        return $response->json('access_token');
    }

    /**
     * Pages the authenticated user manages, each with its own page access token.
     * Returns [] rather than throwing when the user manages no Pages — the
     * caller decides how to report that to the user.
     */
    public function fetchPages(string $userAccessToken): array
    {
        $response = Http::get('https://graph.facebook.com/v21.0/me/accounts', [
            'access_token' => $userAccessToken,
            'fields'       => 'id,name,access_token,business',
        ]);

        if (!$response->ok()) {
            Log::error('Facebook OAuth: /me/accounts failed', ['status' => $response->status(), 'body' => $response->body()]);
            return [];
        }

        $pages = array_filter(
            $response->json('data') ?? [],
            fn (array $p) => isset($p['id'], $p['name'], $p['access_token'])
        );

        return array_values(array_map(function (array $p) {
            $page = ['id' => $p['id'], 'name' => $p['name'], 'access_token' => $p['access_token']];
            if (isset($p['business']['id'])) {
                $page['business_id'] = $p['business']['id'];
            }
            return $page;
        }, $pages));
    }

    /**
     * Subscribe a Page to this app's leadgen webhook field. Without this call the
     * webhook endpoint can return 200 to Meta's own dashboard test yet still never
     * receive a real lead — the failure mode that motivated this whole flow.
     * Never throws: a failed subscription must not undo an otherwise-saved connection.
     */
    public function subscribePage(string $pageId, string $pageAccessToken): bool
    {
        try {
            $response = Http::asForm()->post("https://graph.facebook.com/v21.0/{$pageId}/subscribed_apps", [
                'subscribed_fields' => 'leadgen',
                'access_token'      => $pageAccessToken,
            ]);

            if (!$response->ok() || !$response->json('success')) {
                Log::error('Facebook OAuth: subscribed_apps failed', ['page_id' => $pageId, 'status' => $response->status(), 'body' => $response->body()]);
                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::error('Facebook OAuth: exception subscribing page', ['page_id' => $pageId, 'error' => $e->getMessage()]);
            return false;
        }
    }

    /**
     * Claim a delegated management relationship on the page's owning Business (if any),
     * granting this app's own pre-configured Business Manager (FACEBOOK_BUSINESS_ID)
     * lead-management access without a per-customer App Review relationship — see
     * docs/superpowers/specs/2026-08-20-facebook-delegation-lead-ads-design.md.
     * Never throws: a failed delegation must not undo an otherwise-saved connection, and
     * a page with no owning Business (personal page) simply has nothing to delegate.
     */
    private function delegatePage(string $pageId, string $pageAccessToken, string $userAccessToken, ?string $clientBusinessId): void
    {
        if (!$clientBusinessId) {
            return;
        }

        $ourBusinessId = config('services.facebook.business_id');
        if (!$ourBusinessId) {
            Log::warning('Facebook OAuth: skipping delegation, FACEBOOK_BUSINESS_ID not configured', ['page_id' => $pageId]);
            return;
        }

        $this->graphPostBestEffort(
            "https://graph.facebook.com/v21.0/{$ourBusinessId}/managed_businesses",
            ['existing_client_business_id' => $clientBusinessId, 'access_token' => $userAccessToken],
            'managed_businesses',
            $pageId
        );

        $this->graphPostBestEffort(
            "https://graph.facebook.com/v21.0/{$pageId}/agencies",
            ['business' => $ourBusinessId, 'permitted_tasks' => ['ADVERTISE', 'MANAGE_LEADS'], 'access_token' => $pageAccessToken],
            'agencies',
            $pageId
        );
    }

    /**
     * One-time sync of a page's existing lead forms and their historical leads on first
     * connect — Facebook's webhook only delivers leads generated after subscription, so
     * without this, everything captured before "Connect with Facebook" was clicked is lost.
     * Never throws: a failed or partial backfill must not undo an otherwise-saved connection.
     * Per-form failures don't abort the remaining forms.
     */
    private function backfillLeads(string $pageId, string $pageAccessToken, int $tenantId): void
    {
        try {
            $response = Http::get("https://graph.facebook.com/v21.0/{$pageId}/leadgen_forms", [
                'access_token' => $pageAccessToken,
                'fields'       => 'id,name,status',
                'limit'        => 50,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Facebook OAuth: leadgen_forms fetch failed', ['page_id' => $pageId, 'error' => $e->getMessage()]);
            return;
        }

        if (!$response->ok()) {
            Log::warning('Facebook OAuth: leadgen_forms fetch failed', ['page_id' => $pageId, 'status' => $response->status(), 'body' => $response->body()]);
            return;
        }

        foreach ($response->json('data') ?? [] as $form) {
            $this->backfillFormLeads($form['id'] ?? null, $pageAccessToken, $tenantId);
        }
    }

    private function backfillFormLeads(?string $formId, string $pageAccessToken, int $tenantId): void
    {
        if (!$formId) {
            return;
        }

        $params = ['access_token' => $pageAccessToken, 'fields' => 'id,created_time,field_data', 'limit' => 50];

        do {
            try {
                $response = Http::get("https://graph.facebook.com/v21.0/{$formId}/leads", $params);
            } catch (\Throwable $e) {
                Log::warning('Facebook OAuth: leads fetch failed', ['form_id' => $formId, 'error' => $e->getMessage()]);
                return;
            }

            if (!$response->ok()) {
                Log::warning('Facebook OAuth: leads fetch failed', ['form_id' => $formId, 'status' => $response->status(), 'body' => $response->body()]);
                return;
            }

            foreach ($response->json('data') ?? [] as $lead) {
                if (!isset($lead['id'])) {
                    continue;
                }
                $this->leadAdsService->upsertLead($lead, $formId, $lead['id'], $tenantId);
            }

            $after = $response->json('paging.cursors.after');
            $params['after'] = $after;
        } while ($after);
    }

    /**
     * POST a delegation call, logging any non-2xx response except the expected
     * "duplicated asset" case (page already delegated — not a real failure), and
     * never letting a connection exception escape. Mirrors subscribePage()'s
     * response->ok() check so delegation failures are as debuggable as subscription
     * failures already are, while still honoring the "never throws" contract.
     */
    private function graphPostBestEffort(string $url, array $params, string $label, string $pageId): void
    {
        try {
            $response = Http::asForm()->post($url, $params);
            $message  = $response->json('error.message', '');
            if (!$response->ok() && !str_contains($message, 'duplicated asset')) {
                Log::warning("Facebook OAuth: {$label} call failed", ['page_id' => $pageId, 'status' => $response->status(), 'body' => $response->body()]);
            }
        } catch (\Throwable $e) {
            Log::warning("Facebook OAuth: {$label} call failed", ['page_id' => $pageId, 'error' => $e->getMessage()]);
        }
    }

    /**
     * Persist the chosen Page's connection details for the current tenant and
     * attempt the webhook subscription. Always saves the connection, even if the
     * subscription call fails — the caller surfaces $result['subscribed'] === false
     * as a warning rather than losing the connection outright.
     */
    public function connectPage(array $page, int $tenantId): array
    {
        app()->instance('current_tenant_id', $tenantId);

        $this->settings->set('facebook_page_id', $page['id']);
        $this->settings->set('facebook_page_name', $page['name']);
        $this->settings->set('facebook_page_access_token', $page['access_token']);
        $this->settings->set('facebook_connection_status', null); // clear any prior needs_renewal flag

        $subscribed = $this->subscribePage($page['id'], $page['access_token']);

        if (isset($page['user_access_token'])) {
            $this->delegatePage($page['id'], $page['access_token'], $page['user_access_token'], $page['business_id'] ?? null);
        }

        $this->backfillLeads($page['id'], $page['access_token'], $tenantId);

        return ['page_name' => $page['name'], 'subscribed' => $subscribed];
    }
}
