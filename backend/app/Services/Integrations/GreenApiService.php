<?php

namespace App\Services\Integrations;

use App\Services\PhoneNormalizer;
use App\Services\SettingsService;
use Illuminate\Support\Facades\Log;

/**
 * GREEN-API WhatsApp integration.
 *
 * Ported from Taskey's taskey_api/green_api (createGreenApiInstance.php,
 * green_api_receive_notification.php, send_whatsapp_api_green_api). Only the
 * framework glue changed: s_s() -> SettingsService, error_log() -> Log, the
 * Israeli phone->chatId helper -> PhoneNormalizer. The HTTP contract (waInstance
 * URLs, sendMessage / SendFileByUrl / getStateInstance payloads) is unchanged.
 *
 * Unlike Taskey we do NOT disable TLS verification — libcurl secure defaults
 * (VERIFYPEER=true) are kept.
 *
 * Base URL: https://api.green-api.com
 */
class GreenApiService
{
    private ?string $instanceId;
    private ?string $token;
    private string $base_url = 'https://api.green-api.com';

    public function __construct(?string $instanceId = null, ?string $token = null)
    {
        $settings = app(SettingsService::class);
        $this->instanceId = $instanceId ?: $settings->get('greenapi_instance_id');
        $this->token      = $token      ?: $settings->get('greenapi_token');
    }

    public function isConfigured(): bool
    {
        return !empty($this->instanceId) && !empty($this->token);
    }

    /**
     * Build a GREEN-API chatId from a phone. Mirrors Taskey's
     * get_chat_id_from_phone(): Israeli-normalize then append @c.us.
     */
    public function chatId(string $phone): string
    {
        $normalized = PhoneNormalizer::normalize($phone) ?? preg_replace('/\D+/', '', $phone);
        return $normalized . '@c.us';
    }

    private function endpoint(string $method): string
    {
        return "{$this->base_url}/waInstance{$this->instanceId}/{$method}/{$this->token}";
    }

    /**
     * POST JSON to a GREEN-API method. Returns decoded body + http_code.
     */
    private function post(string $method, array $payload): array
    {
        if (!$this->isConfigured()) {
            return ['status' => 'error', 'message' => 'Missing GREEN-API credentials'];
        }

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $this->endpoint($method),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);

        $response   = curl_exec($ch);
        $http_code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curl_error = curl_error($ch);
        curl_close($ch);

        Log::info('GreenApi ' . $method, ['http_code' => $http_code, 'curl_error' => $curl_error]);

        if ($curl_error) {
            return ['status' => 'error', 'message' => "Connection Error: $curl_error"];
        }

        $data = json_decode($response, true);

        if ($http_code >= 200 && $http_code < 300) {
            return ['status' => 'success', 'data' => $data];
        }

        return [
            'status'    => 'error',
            'message'   => $data['message'] ?? "GREEN-API HTTP $http_code",
            'http_code' => $http_code,
        ];
    }

    /**
     * GET a GREEN-API method (state checks etc.).
     */
    private function get(string $method): array
    {
        if (!$this->isConfigured()) {
            return ['status' => 'error', 'message' => 'Missing GREEN-API credentials'];
        }

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $this->endpoint($method),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => ['Accept: application/json'],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 10,
        ]);

        $response   = curl_exec($ch);
        $http_code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curl_error = curl_error($ch);
        curl_close($ch);

        if ($curl_error) {
            return ['status' => 'error', 'message' => "Connection Error: $curl_error"];
        }

        $data = json_decode($response, true);

        if ($http_code >= 200 && $http_code < 300) {
            return ['status' => 'success', 'data' => $data];
        }

        return ['status' => 'error', 'message' => "GREEN-API HTTP $http_code", 'http_code' => $http_code];
    }

    /**
     * Send a text message to a phone number.
     */
    public function sendMessage(string $phone, string $message): array
    {
        $result = $this->post('sendMessage', [
            'chatId'  => $this->chatId($phone),
            'message' => $message,
        ]);

        if ($result['status'] === 'success') {
            $result['message_id'] = $result['data']['idMessage'] ?? null;
        }
        return $result;
    }

    /**
     * Send a file by URL (document/image) with optional caption.
     */
    public function sendFileByUrl(string $phone, string $url, string $fileName, string $caption = ''): array
    {
        return $this->post('SendFileByUrl', [
            'chatId'   => $this->chatId($phone),
            'urlFile'  => $url,
            'fileName' => $fileName,
            'caption'  => $caption,
        ]);
    }

    /**
     * getStateInstance — used as connection test. "authorized" = phone linked.
     */
    public function getStateInstance(): array
    {
        return $this->get('getStateInstance');
    }

    public function testConnection(): array
    {
        $result = $this->getStateInstance();
        if ($result['status'] === 'success') {
            $state = $result['data']['stateInstance'] ?? 'unknown';
            $result['state'] = $state;
            if ($state !== 'authorized') {
                return ['status' => 'error', 'message' => "Instance state: $state (not authorized)", 'state' => $state];
            }
        }
        return $result;
    }
}
