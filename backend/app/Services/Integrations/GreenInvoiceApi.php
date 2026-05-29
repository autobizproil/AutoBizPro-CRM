<?php

namespace App\Services\Integrations;

use App\Services\SettingsService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * GreenInvoice (Morning) API Integration.
 *
 * Ported almost verbatim from Taskey's taskey_api/greeninvoice/greeninvoice_api.php.
 * Only the framework glue changed: s_s() -> SettingsService, the static token
 * cache -> Laravel Cache (per-tenant), error_log() -> Log::info(). The HTTP
 * contract, payloads, document types and 401-retry behaviour are unchanged.
 *
 * Base URL: https://api.greeninvoice.co.il/api/v1 (Production)
 *           https://sandbox.greeninvoice.co.il/api/v1 (Sandbox)
 */
class GreenInvoiceApi
{
    private ?string $api_key_id;
    private ?string $api_key_secret;
    private string $base_url = 'https://api.greeninvoice.co.il/api/v1';
    private ?string $token = null;
    private ?int $token_expires = null;
    private int $tenantId;

    public function __construct(?string $api_key_id = null, ?string $api_key_secret = null, bool $sandbox = false)
    {
        $settings = app(SettingsService::class);
        $this->tenantId = (int) app('current_tenant_id');

        $this->api_key_id     = $api_key_id     ?: $settings->get('greeninvoice_api_key_id');
        $this->api_key_secret = $api_key_secret ?: $settings->get('greeninvoice_api_key_secret');

        if ($sandbox || $settings->get('greeninvoice_sandbox') === '1') {
            $this->base_url = 'https://sandbox.greeninvoice.co.il/api/v1';
        }
    }

    private function tokenCacheKey(): string
    {
        return "greeninvoice_token_{$this->tenantId}";
    }

    /**
     * Authenticate and get JWT token. Caches token (per-tenant) and checks
     * expiry before requesting a new one.
     */
    public function authenticate(): array
    {
        if ($this->hasValidToken()) {
            return ['status' => 'success', 'token' => $this->token];
        }

        if (empty($this->api_key_id) || empty($this->api_key_secret)) {
            return ['status' => 'error', 'message' => 'Missing API credentials'];
        }

        $url = $this->base_url . '/account/token';
        $post_data = json_encode([
            'id'         => $this->api_key_id,
            'secret'     => $this->api_key_secret,
            'grant_type' => 'client_credentials',
        ]);

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $post_data,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);

        $response   = curl_exec($ch);
        $http_code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curl_error = curl_error($ch);
        $curl_errno = curl_errno($ch);
        curl_close($ch);

        Log::info('GreenInvoice Auth', ['url' => $url, 'http_code' => $http_code, 'curl_error' => $curl_error]);

        if ($curl_error) {
            return ['status' => 'error', 'message' => "Connection Error: $curl_error (Code: $curl_errno)"];
        }
        if (empty($response)) {
            return ['status' => 'error', 'message' => "Empty response from API (HTTP $http_code)"];
        }

        $data = json_decode($response, true);

        if ($http_code !== 200 || empty($data['token'])) {
            $error_msg = $data['message'] ?? 'Unknown error';
            return [
                'status'  => 'error',
                'message' => "Authentication failed: $error_msg (HTTP $http_code)",
            ];
        }

        $this->token         = $data['token'];
        $this->token_expires = $data['expires'] ?? (time() + 3600);
        // Cache slightly short of real expiry to avoid edge-of-expiry 401s
        Cache::put($this->tokenCacheKey(), [
            'token'   => $this->token,
            'expires' => $this->token_expires,
        ], max(60, $this->token_expires - time() - 60));

        return ['status' => 'success', 'token' => $this->token, 'expires' => $this->token_expires];
    }

    private function hasValidToken(): bool
    {
        $cached = Cache::get($this->tokenCacheKey());
        if ($cached && ($cached['expires'] ?? 0) > time()) {
            $this->token         = $cached['token'];
            $this->token_expires = $cached['expires'];
            return true;
        }
        return false;
    }

    /**
     * Create a document (invoice, receipt, etc.). Retries once on 401.
     */
    public function createDocument(array $document_data): array
    {
        $auth = $this->authenticate();
        if ($auth['status'] !== 'success') {
            return $auth;
        }

        $url       = $this->base_url . '/documents';
        $post_data = json_encode($document_data);

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $post_data,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $this->token,
                'Content-Type: application/json',
                'Accept: application/json',
            ],
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);

        $response   = curl_exec($ch);
        $http_code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curl_error = curl_error($ch);
        curl_close($ch);

        Log::info('GreenInvoice createDocument', ['http_code' => $http_code, 'curl_error' => $curl_error]);

        if ($curl_error) {
            return ['status' => 'error', 'message' => "CURL Error: $curl_error"];
        }

        if ($http_code === 401) {
            $this->token = null;
            Cache::forget($this->tokenCacheKey());
            $auth = $this->authenticate();
            if ($auth['status'] === 'success') {
                return $this->createDocument($document_data); // retry once
            }
            return $auth;
        }

        $data = json_decode($response, true);

        if ($http_code === 200 || $http_code === 201) {
            return [
                'status'      => 'success',
                'document_id' => $data['id'] ?? $data['documentId'] ?? null,
                'data'        => $data,
            ];
        }

        return [
            'status'       => 'error',
            'message'      => $data['errorMessage'] ?? $data['message'] ?? 'Failed to create document',
            'http_code'    => $http_code,
            'raw_response' => $response,
        ];
    }

    /**
     * Download document as PDF (binary). Retries once on 401.
     */
    public function downloadDocumentPDF(string $document_id): array
    {
        $auth = $this->authenticate();
        if ($auth['status'] !== 'success') {
            return $auth;
        }

        $url = $this->base_url . '/documents/' . urlencode($document_id) . '/download';

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $this->token, 'Accept: application/pdf'],
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_BINARYTRANSFER => true,
        ]);

        $response   = curl_exec($ch);
        $http_code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curl_error = curl_error($ch);
        curl_close($ch);

        if ($curl_error) {
            return ['status' => 'error', 'message' => "CURL Error: $curl_error"];
        }

        if ($http_code === 401) {
            $this->token = null;
            Cache::forget($this->tokenCacheKey());
            $auth = $this->authenticate();
            if ($auth['status'] === 'success') {
                return $this->downloadDocumentPDF($document_id);
            }
            return $auth;
        }

        if ($http_code === 200) {
            return ['status' => 'success', 'pdf' => $response];
        }

        return ['status' => 'error', 'message' => "Failed to download document (HTTP $http_code)", 'http_code' => $http_code];
    }

    /**
     * Convenience: create an invoice with common defaults.
     * Doc types: 305=חשבונית מס, 330=חשבונית מס קבלה, 400=קבלה, 320=זיכוי.
     */
    public function createInvoice(array $params): array
    {
        $type = isset($params['type']) ? (int) $params['type'] : 305;

        $document_data = [
            'description' => $params['description'] ?? 'חשבונית',
            'type'        => $type,
            'date'        => date('Y-m-d'),
            'dueDate'     => date('Y-m-d'),
            'lang'        => $params['lang'] ?? 'he',
            'currency'    => $params['currency'] ?? 'ILS',
            'vatType'     => $params['vatType'] ?? 0,
            'signed'      => $params['signed'] ?? true,
            'rounding'    => $params['rounding'] ?? false,
            'client'      => $params['client'] ?? [],
            'income'      => $params['income'] ?? [],
        ];

        if (!empty($params['payment'])) {
            $document_data['payment'] = $params['payment'];
        }

        return $this->createDocument($document_data);
    }

    public function testConnection(): array
    {
        return $this->authenticate();
    }
}
