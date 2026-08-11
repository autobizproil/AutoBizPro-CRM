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

    public function __construct(SettingsService $settings)
    {
        $this->settings = $settings;
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
            'fields'       => 'id,name,access_token',
        ]);

        if (!$response->ok()) {
            Log::error('Facebook OAuth: /me/accounts failed', ['status' => $response->status(), 'body' => $response->body()]);
            return [];
        }

        return array_map(
            fn (array $p) => ['id' => $p['id'], 'name' => $p['name'], 'access_token' => $p['access_token']],
            $response->json('data') ?? []
        );
    }

    /**
     * Subscribe a Page to this app's leadgen webhook field. Without this call the
     * webhook endpoint can return 200 to Meta's own dashboard test yet still never
     * receive a real lead — the failure mode that motivated this whole flow.
     * Never throws: a failed subscription must not undo an otherwise-saved connection.
     */
    public function subscribePage(string $pageId, string $pageAccessToken): bool
    {
        $response = Http::asForm()->post("https://graph.facebook.com/v21.0/{$pageId}/subscribed_apps", [
            'subscribed_fields' => 'leadgen',
            'access_token'      => $pageAccessToken,
        ]);

        if (!$response->ok() || !$response->json('success')) {
            Log::error('Facebook OAuth: subscribed_apps failed', ['page_id' => $pageId, 'status' => $response->status(), 'body' => $response->body()]);
            return false;
        }

        return true;
    }
}
