<?php

namespace App\Services\Integrations;

use App\Services\SettingsService;
use Illuminate\Support\Facades\Log;

/**
 * Cardcom payment-page integration.
 *
 * Ported from Taskey's taskey_purchases/cardcom_api (cardcom_api_create_page.php,
 * cardcom_api_GetLowProfileIndicator.php).  Only the framework glue changed:
 * s_s() -> SettingsService, Taskey-specific redirect helpers dropped, PHP curl
 * calls kept verbatim.
 *
 * Security:
 *  - TLS verification is ENABLED (CURLOPT_SSL_VERIFYPEER is NOT set to 0).
 *  - Raw card numbers are never stored — only the LowProfileCode token.
 *
 * Cardcom API endpoints:
 *  - Create page : POST https://secure.cardcom.solutions/Interface/LowProfile.aspx
 *  - Get result  : GET  https://secure.cardcom.solutions/Interface/BillGoldGetLowProfileIndicator.aspx
 */
class CardcomService
{
    private ?string $terminal;
    private ?string $apiName;
    private ?string $apiPassword;

    /** Cardcom endpoint for creating a hosted low-profile charge page. */
    private const CREATE_PAGE_URL = 'https://secure.cardcom.solutions/Interface/LowProfile.aspx';

    /** Cardcom endpoint for retrieving a transaction result by LowProfileCode. */
    private const GET_INDICATOR_URL = 'https://secure.cardcom.solutions/Interface/BillGoldGetLowProfileIndicator.aspx';

    public function __construct()
    {
        $settings          = app(SettingsService::class);
        $this->terminal    = $settings->get('cardcom_terminal');
        $this->apiName     = $settings->get('cardcom_api_name');
        $this->apiPassword = $settings->get('cardcom_api_password');
    }

    public function isConfigured(): bool
    {
        return !empty($this->terminal) && !empty($this->apiName) && !empty($this->apiPassword);
    }

    /**
     * Create a Cardcom hosted charge page (LowProfile).
     *
     * Mirrors cardcom_api_create_page_redirect_vars() from Taskey —
     * POSTs to LowProfile.aspx, parses the key=value response, and
     * returns the redirect URL the client should be sent to.
     *
     * @param array $params {
     *   amount      float   required — amount to charge (ILS)
     *   description string  required — shown on the charge page / invoice line
     *   indicator_url string  optional — callback URL Cardcom will POST to on completion
     *   success_url   string  optional — redirect after successful payment
     *   error_url     string  optional — redirect after failed payment
     *   return_value  string  optional — arbitrary passthrough value
     *   email         string  optional
     *   name          string  optional
     *   phone         string  optional
     * }
     * @return array{status:string, url:string|null, low_profile_code:string|null, response_code:int|null, message:string|null}
     */
    public function createChargePage(array $params): array
    {
        if (!$this->isConfigured()) {
            return ['status' => 'error', 'url' => null, 'low_profile_code' => null, 'message' => 'Cardcom is not configured'];
        }

        $amount      = (float) ($params['amount']      ?? 0);
        $description = $params['description'] ?? '';
        $indicatorUrl = $params['indicator_url'] ?? '';
        $successUrl   = $params['success_url']   ?? '';
        $errorUrl     = $params['error_url']     ?? '';
        $returnValue  = $params['return_value']  ?? '';
        $email        = $params['email']         ?? '';
        $name         = $params['name']          ?? '';
        $phone        = $params['phone']         ?? '';

        // Operation 2 = charge, 3 = token only (charge happens later)
        $operation = $amount > 0 ? 2 : 3;

        $vars = [
            'TerminalNumber'    => $this->terminal,
            'username'          => $this->apiName,
            'password'          => $this->apiPassword,
            'CoinID'            => 1,           // ILS
            'Operation'         => $operation,
            'SumToBill'         => $amount,
            'IndicatorUrl'      => $indicatorUrl,
            'SuccessRedirectUrl'=> $successUrl,
            'ErrorRedirectUrl'  => $errorUrl,
            'ReturnValue'       => $returnValue,
            'Language'          => 'he',
            'codepage'          => '65001',     // UTF-8
            'APILevel'          => 10,

            // Card-owner pre-fill (optional, never stored here)
            'CardOwnerEmail'    => $email,
            'CardOwnerName'     => $name,
            'CardOwnerPhone'    => $phone,

            // Single invoice line mirroring Taskey's InvoiceLines pattern
            'InvoiceLines.Description' => $description,
            'InvoiceLines.Price'       => $amount,
            'InvoiceLines.Quantity'    => 1,

            // Invoice header
            'ShowInvoiceHead'           => 'true',
            'InvoiceHeadOperation'      => 1,
            'InvoiceHead.Language'      => 'he',
            'InvoiceHead.SendByEmail'   => 'true',
            'InvoiceHead.ReqEmail'      => 'true',
            'InvoiceHead.CoinID'        => 1,
            'InvoiceHead.Email'         => $email,
            'InvoiceHead.CustName'      => $name,
            'InvoiceHead.CustMobilePH'  => $phone,
        ];

        $urlencoded = http_build_query($vars);

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => self::CREATE_PAGE_URL,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $urlencoded,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FAILONERROR    => false,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
            // TLS verification intentionally ENABLED (no CURLOPT_SSL_VERIFYPEER=0)
        ]);

        $result     = curl_exec($ch);
        $curlError  = curl_error($ch);
        $httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        Log::info('Cardcom createChargePage', ['http_code' => $httpCode, 'curl_error' => $curlError]);

        if ($curlError || $result === false) {
            return ['status' => 'error', 'url' => null, 'low_profile_code' => null, 'message' => "cURL error: $curlError"];
        }

        // Cardcom responds with key=value pairs separated by &
        $parsed = [];
        parse_str($result, $parsed);

        // Normalise keys — the API may return mixed-case
        $parsed = array_change_key_case($parsed, CASE_LOWER);

        $responseCode    = (int) ($parsed['responsecode'] ?? -1);
        $lowProfileCode  = $parsed['lowprofilecode'] ?? null;

        if ($responseCode === 0 && !empty($lowProfileCode)) {
            $pageUrl = "https://secure.cardcom.solutions/External/lowProfileClearing/{$this->terminal}.aspx?LowProfileCode={$lowProfileCode}";
            return [
                'status'           => 'success',
                'url'              => $pageUrl,
                'low_profile_code' => $lowProfileCode,
                'response_code'    => $responseCode,
                'message'          => null,
            ];
        }

        $errorMsg = "Cardcom ResponseCode: {$responseCode}";
        Log::warning('Cardcom createChargePage failed', ['response' => $result, 'parsed' => $parsed]);

        return [
            'status'           => 'error',
            'url'              => null,
            'low_profile_code' => null,
            'response_code'    => $responseCode,
            'message'          => $errorMsg,
        ];
    }

    /**
     * Retrieve a transaction result from Cardcom by LowProfileCode.
     *
     * Mirrors cardcom_api_GetLowProfileIndicator() from Taskey — GETs
     * BillGoldGetLowProfileIndicator.aspx and returns the parsed response.
     *
     * @return array{status:string, response_code:int|null, data:array|null, message:string|null}
     */
    public function getTransaction(string $lowProfileCode): array
    {
        if (!$this->isConfigured()) {
            return ['status' => 'error', 'data' => null, 'message' => 'Cardcom is not configured'];
        }

        $url = self::GET_INDICATOR_URL . '?' . http_build_query([
            'terminalnumber' => $this->terminal,
            'username'       => $this->apiName,
            'lowprofilecode' => $lowProfileCode,
        ]);

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL             => $url,
            CURLOPT_RETURNTRANSFER  => true,
            CURLOPT_ENCODING        => '',
            CURLOPT_MAXREDIRS       => 10,
            CURLOPT_TIMEOUT         => 30,
            CURLOPT_CONNECTTIMEOUT  => 10,
            CURLOPT_FOLLOWLOCATION  => true,
            CURLOPT_HTTP_VERSION    => CURL_HTTP_VERSION_1_1,
            CURLOPT_CUSTOMREQUEST   => 'GET',
            CURLOPT_HTTPHEADER      => ['Content-Type: application/x-www-form-urlencoded'],
            // TLS verification intentionally ENABLED
        ]);

        $response  = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        Log::info('Cardcom getTransaction', ['low_profile_code' => $lowProfileCode, 'http_code' => $httpCode]);

        if ($curlError || $response === false) {
            return ['status' => 'error', 'data' => null, 'message' => "cURL error: $curlError"];
        }

        $responseArray = [];
        parse_str($response, $responseArray);

        $responseCode = isset($responseArray['ResponseCode']) ? (int) $responseArray['ResponseCode'] : null;

        if ($responseCode === 0) {
            return [
                'status'        => 'success',
                'response_code' => $responseCode,
                'data'          => $responseArray,
                'message'       => null,
            ];
        }

        return [
            'status'        => 'error',
            'response_code' => $responseCode,
            'data'          => $responseArray,
            'message'       => "Cardcom ResponseCode: {$responseCode}",
        ];
    }
}
