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
}
