<?php

namespace App\Services\Integrations;

use App\Models\Lead;
use App\Services\SettingsService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Google Sheets integration — appends leads to a Google Sheet using
 * a Service Account (no OAuth user flow needed).
 *
 * Setup:
 *   1. Create a Google Cloud project → enable Sheets API
 *   2. Create a Service Account → download JSON key
 *   3. Share your target Sheet with the service account email
 *   4. Paste the JSON key content into google_service_account_json setting
 *   5. Set google_sheets_id to the Sheet ID (from the URL)
 */
class GoogleSheetsService
{
    private SettingsService $settings;

    public function __construct(SettingsService $settings)
    {
        $this->settings = $settings;
    }

    /**
     * Append all tenant leads to the configured Google Sheet.
     * Returns ['appended' => N] on success or throws.
     */
    public function exportLeads(int $tenantId): array
    {
        $sheetId   = $this->settings->get('google_sheets_id');
        $saJson    = $this->settings->get('google_service_account_json');

        if (!$sheetId || !$saJson) {
            throw new \RuntimeException('Google Sheets: missing sheet_id or service_account_json');
        }

        $sa = json_decode($saJson, true);
        if (!$sa) {
            throw new \RuntimeException('Google Sheets: invalid service account JSON');
        }

        $token = $this->getAccessToken($sa);

        $leads = Lead::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->with(['stage', 'assignedUser'])
            ->latest()
            ->get();

        if ($leads->isEmpty()) {
            return ['appended' => 0];
        }

        // Header row + data rows
        $values = [[
            'ID', 'שם', 'טלפון', 'אימייל', 'מקור', 'סטטוס', 'שלב', 'נציג', 'תאריך יצירה',
        ]];

        foreach ($leads as $lead) {
            $values[] = [
                $lead->id,
                $lead->name ?? '',
                $lead->phone ?? '',
                $lead->email ?? '',
                $lead->source ?? '',
                $lead->status ?? '',
                $lead->stage?->name ?? '',
                $lead->assignedUser?->name ?? '',
                $lead->created_at?->format('d/m/Y H:i') ?? '',
            ];
        }

        $range    = 'Sheet1!A1';
        $endpoint = "https://sheets.googleapis.com/v4/spreadsheets/{$sheetId}/values/{$range}:append";

        $response = Http::withToken($token)
            ->timeout(20)
            ->post($endpoint . '?valueInputOption=USER_ENTERED&insertDataOption=OVERWRITE', [
                'values' => $values,
            ]);

        if (!$response->ok()) {
            Log::error('Google Sheets export failed', ['status' => $response->status(), 'body' => $response->body()]);
            throw new \RuntimeException('Google Sheets: ' . ($response->json('error.message') ?? 'export failed'));
        }

        return ['appended' => count($values) - 1];
    }

    private function getAccessToken(array $sa): string
    {
        $now    = time();
        $header = base64_encode(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $claim  = base64_encode(json_encode([
            'iss'   => $sa['client_email'],
            'scope' => 'https://www.googleapis.com/auth/spreadsheets',
            'aud'   => 'https://oauth2.googleapis.com/token',
            'iat'   => $now,
            'exp'   => $now + 3600,
        ]));

        $data = "{$header}.{$claim}";
        openssl_sign($data, $sig, $sa['private_key'], 'sha256');
        $jwt = $data . '.' . base64_encode($sig);

        $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $jwt,
        ]);

        if (!$response->ok()) {
            throw new \RuntimeException('Google Sheets: failed to get access token');
        }

        return $response->json('access_token');
    }
}
