<?php

namespace App\Services\Integrations;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Thin wrapper around Make.com's REST API, used only by
 * `make:onboard-facebook-bridge` to provision a customer's scenario without
 * a human clicking through Make's UI. Uses a personal API token
 * (MAKE_API_TOKEN) with full scopes — deliberately NOT the Claude/MCP OAuth
 * connection, which has no organization/app-read scope (confirmed
 * 2026-08-14 — see docs/superpowers/specs/2026-08-14-make-onboarding-automation-design.md).
 */
class MakeApiService
{
    /**
     * Create a scenario in the configured team. Scenario starts inactive
     * (on-demand scheduling) — Make doesn't allow activating a scenario
     * whose trigger module has no connection configured yet.
     *
     * @param array $blueprint Must have 'name', 'flow', 'metadata' keys.
     * @return array Decoded JSON response body from Make's API.
     * @throws \RuntimeException on any non-2xx response.
     */
    public function createScenario(string $name, array $blueprint): array
    {
        $teamId = config('services.make.team_id');

        $response = Http::withHeaders([
            'Authorization' => 'Token ' . config('services.make.api_token'),
        ])->asForm()->post(
            rtrim(config('services.make.api_base_url'), '/') . '/scenarios?teamId=' . $teamId,
            [
                'blueprint'  => json_encode($blueprint),
                'scheduling' => json_encode(['type' => 'on-demand']),
            ]
        );

        if (!$response->successful()) {
            Log::error('Make API: scenario creation failed', [
                'status' => $response->status(),
                'body'   => $response->body(),
            ]);
            throw new \RuntimeException($response->json('message') ?? $response->body());
        }

        return $response->json();
    }
}
