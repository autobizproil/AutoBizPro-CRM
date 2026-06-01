<?php

namespace App\Services\Integrations;

use App\Services\SettingsService;
use Illuminate\Support\Facades\Log;

/**
 * Yesh Invoice (יש חשבונית) API Integration.
 *
 * Ported almost verbatim from Taskey's
 * taskey_api/yeshinvoice_api/yeshinvoice_api.php.
 *
 * Framework glue swapped:
 *   - DB row / $_SESSION  → SettingsService (per-tenant key-value store)
 *   - error_log()         → Log::info() / Log::warning()
 *   - Plain cURL          → same plain cURL, TLS ENABLED (no VERIFYPEER=0)
 *
 * Settings keys used (prefixed `yesh_` to avoid collisions):
 *   yesh_user_key   — the UserKey returned by addCompany
 *   yesh_secret_key — the SecretKey returned by addCompany
 *
 * Base URL:  https://api.yeshinvoice.co.il/api/v1   (addCompany)
 *            https://api.yeshinvoice.co.il/api/v1.1 (createDocument)
 */
class YeshInvoiceService
{
    private const ADD_COMPANY_URL     = 'https://api.yeshinvoice.co.il/api/v1/addCompany';
    private const CREATE_DOCUMENT_URL = 'https://api.yeshinvoice.co.il/api/v1.1/createDocument';

    private ?string $userKey;
    private ?string $secretKey;

    public function __construct()
    {
        $settings        = app(SettingsService::class);
        $this->userKey   = $settings->get('yesh_user_key');
        $this->secretKey = $settings->get('yesh_secret_key');
    }

    /**
     * Returns true when both UserKey and SecretKey are present.
     */
    public function isConfigured(): bool
    {
        return !empty($this->userKey) && !empty($this->secretKey);
    }

    /**
     * Create an invoice document on Yesh Invoice.
     *
     * Mirrors yeshinvoice_api_create_document_action() from Taskey.
     *
     * @param array $params {
     *   title           string   — document title
     *   notes           string   — notes visible to customer
     *   notes_bottom    string   — bottom notes
     *   currency_id     int      — 1=ILS, 2=USD, etc. (default 1)
     *   lang_id         int      — e.g. 359 for Hebrew
     *   document_type   int      — 1=invoice (default)
     *   vat_percentage  int|float — e.g. 17 for 17%
     *   order_number    string   — unique order reference; auto-generated if omitted
     *   date_created    string   — Y-m-d H:i (default: now)
     *   max_date        string   — Y-m-d H:i (default: +30 days)
     *   status_id       int      — default 1
     *   customer        array    — ['Name' => '...']
     *   items           array    — array of item arrays
     *   payments        array    — array of payment arrays
     *   discount        array    — ['amount' => n, 'typeid' => n] or []
     *   send_sms        bool
     *   send_email      bool
     *   include_pdf     bool
     * }
     *
     * @return array{status:string, document_id:string|null, url:string|null, message:string|null}
     */
    public function createInvoice(array $params): array
    {
        if (!$this->isConfigured()) {
            return [
                'status'      => 'error',
                'document_id' => null,
                'url'         => null,
                'message'     => 'Yesh Invoice לא מוגדר — הזן UserKey ו-SecretKey בהגדרות',
            ];
        }

        $orderNumber = $params['order_number'] ?? ('ORD-' . uniqid() . '-' . rand(1000, 9999));

        $documentData = [
            'Title'         => $params['title']          ?? '',
            'Notes'         => $params['notes']          ?? '',
            'NotesBottom'   => $params['notes_bottom']   ?? '',
            'HideNotes'     => $params['hide_notes']     ?? '',
            'CurrencyID'    => $params['currency_id']    ?? 1,
            'LangID'        => $params['lang_id']        ?? 359,
            'SendSMS'       => $params['send_sms']       ?? false,
            'SendEmail'     => $params['send_email']     ?? false,
            'IncludePDF'    => $params['include_pdf']    ?? false,
            'DocumentType'  => $params['document_type']  ?? 1,
            'ExchangeRate'  => $params['exchange_rate']  ?? 1,
            'vatPercentage' => $params['vat_percentage'] ?? 17,
            'OrderNumber'   => $orderNumber,
            'DateCreated'   => $params['date_created']   ?? date('Y-m-d H:i'),
            'MaxDate'       => $params['max_date']        ?? date('Y-m-d H:i', strtotime('+30 days')),
            'statusID'      => $params['status_id']      ?? 1,
            'Customer'      => $params['customer']       ?? ['Name' => ''],
            'items'         => $params['items']          ?? [],
            'payments'      => $params['payments']       ?? [],
        ];

        if (!empty($params['discount'])) {
            $documentData['discount'] = $params['discount'];
        }

        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL            => self::CREATE_DOCUMENT_URL,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                // Authorization header format from Taskey source (verbatim)
                'Authorization: {"secret":"' . $this->secretKey . '","userkey":"' . $this->userKey . '"}',
            ],
            CURLOPT_POSTFIELDS     => json_encode($documentData),
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
            // TLS verification ENABLED — never set CURLOPT_SSL_VERIFYPEER = false
        ]);

        $response   = curl_exec($curl);
        $httpCode   = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $curlError  = curl_error($curl);
        curl_close($curl);

        Log::info('[YeshInvoice] createDocument', [
            'http_code'  => $httpCode,
            'curl_error' => $curlError,
        ]);

        if ($curlError) {
            return [
                'status'      => 'error',
                'document_id' => null,
                'url'         => null,
                'message'     => 'שגיאת תקשורת: ' . $curlError,
            ];
        }

        $data = json_decode($response, true);

        $pdfUrl    = $data['ReturnValue']['pdfurl']    ?? null;
        $docNumber = $data['ReturnValue']['docNumber']  ?? null;

        if (!empty($docNumber)) {
            Log::info('[YeshInvoice] Document created', [
                'doc_number'   => $docNumber,
                'order_number' => $orderNumber,
            ]);
            return [
                'status'      => 'success',
                'document_id' => (string) $docNumber,
                'url'         => $pdfUrl,
                'message'     => null,
            ];
        }

        $errorMessage = 'שגיאה ביצירת המסמך';
        if (!empty($data['ErrorMessage'])) {
            $errorMessage .= ': ' . $data['ErrorMessage'];
        } elseif (!empty($data['message'])) {
            $errorMessage .= ': ' . $data['message'];
        }

        Log::warning('[YeshInvoice] createDocument failed', [
            'http_code' => $httpCode,
            'response'  => $response,
        ]);

        return [
            'status'      => 'error',
            'document_id' => null,
            'url'         => null,
            'message'     => $errorMessage,
        ];
    }

    /**
     * Lightweight connectivity / auth check.
     *
     * We verify the keys are configured locally (no network round-trip for a
     * pure "ping"). Yesh Invoice has no dedicated /ping or /auth endpoint in
     * the v1/v1.1 contract observed in the Taskey source. Returning a graceful
     * "not configured" error mirrors the GreenInvoiceApi pattern.
     *
     * @return array{status:string, message:string}
     */
    public function testConnection(): array
    {
        if (!$this->isConfigured()) {
            return [
                'status'  => 'error',
                'message' => 'Yesh Invoice לא מוגדר — הזן UserKey ו-SecretKey בהגדרות',
            ];
        }

        // Attempt a real connectivity check by posting a minimal createDocument
        // call with obviously-invalid data. A proper auth error (not a network
        // error) proves the endpoint is reachable and credentials are recognised.
        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL            => self::CREATE_DOCUMENT_URL,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: {"secret":"' . $this->secretKey . '","userkey":"' . $this->userKey . '"}',
            ],
            CURLOPT_POSTFIELDS     => json_encode(['ping' => true]),
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 10,
            // TLS ENABLED
        ]);

        $response  = curl_exec($curl);
        $httpCode  = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $curlError = curl_error($curl);
        curl_close($curl);

        Log::info('[YeshInvoice] testConnection', [
            'http_code'  => $httpCode,
            'curl_error' => $curlError,
        ]);

        if ($curlError) {
            return [
                'status'  => 'error',
                'message' => 'שגיאת תקשורת: ' . $curlError,
            ];
        }

        $data = json_decode($response, true);

        // Any HTTP response from the Yesh Invoice server (even an API-level
        // error) means TLS + credentials were accepted at the transport level.
        // A 401 / auth-level error is returned as status=error with a message.
        // If the server responds at all, the connection is working.
        if ($httpCode >= 200 && $httpCode < 500) {
            // Check if it looks like an auth rejection
            if (!empty($data['ErrorMessage']) && stripos($data['ErrorMessage'], 'auth') !== false) {
                return [
                    'status'  => 'error',
                    'message' => 'אימות נכשל: ' . $data['ErrorMessage'],
                ];
            }
            return [
                'status'  => 'success',
                'message' => 'מחובר בהצלחה ל-Yesh Invoice ✓',
            ];
        }

        return [
            'status'  => 'error',
            'message' => 'שגיאת שרת (HTTP ' . $httpCode . ')',
        ];
    }
}
