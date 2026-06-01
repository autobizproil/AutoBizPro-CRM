<?php

namespace App\Services;

use App\Models\Tenant;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class NotificationService
{
    public function sendEmail(int $tenantId, array $action, array $context): void
    {
        $to       = $context['email'] ?? null;
        $template = $action['template'] ?? 'default';

        if (! $to) {
            return;
        }

        Mail::raw("Template: $template\n\n" . json_encode($context), function ($msg) use ($to, $template) {
            $msg->to($to)->subject("CRM: $template");
        });
    }

    public function sendWhatsapp(int $tenantId, array $action, array $context): void
    {
        $tenant   = Tenant::find($tenantId);
        $settings = $tenant?->settings ?? [];
        $provider = $settings['whatsapp_provider'] ?? null;
        $apiKey   = $settings['whatsapp_api_key'] ?? null;
        $phone    = $context['phone'] ?? null;
        $message  = $action['message'] ?? '';

        if (! $provider || ! $apiKey || ! $phone) {
            Log::warning("WhatsApp not configured for tenant $tenantId");
            return;
        }

        match ($provider) {
            '360dialog' => $this->send360dialog($apiKey, $phone, $message),
            'ultramsg'  => $this->sendUltramsg($apiKey, $phone, $message),
            'smartsend' => $this->sendSmartsend($apiKey, $phone, $message),
            'twilio'    => $this->sendTwilio($apiKey, $phone, $message),
            default     => Log::warning("Unknown WhatsApp provider: $provider"),
        };
    }

    private function send360dialog(string $apiKey, string $phone, string $message): void
    {
        Http::withHeaders(['D360-API-KEY' => $apiKey])
            ->post('https://waba.360dialog.io/v1/messages', [
                'to'   => $phone,
                'type' => 'text',
                'text' => ['body' => $message],
            ]);
    }

    private function sendUltramsg(string $apiKey, string $phone, string $message): void
    {
        Http::post("https://api.ultramsg.com/instance1/messages/chat", [
            'token' => $apiKey,
            'to'    => $phone,
            'body'  => $message,
        ]);
    }

    private function sendSmartsend(string $apiKey, string $phone, string $message): void
    {
        Http::withToken($apiKey)
            ->post('https://api.smartsend.co.il/send', [
                'phone'   => $phone,
                'message' => $message,
            ]);
    }

    private function sendTwilio(string $apiKey, string $phone, string $message): void
    {
        // apiKey format: "accountSid:authToken:fromNumber"
        [$sid, $token, $from] = explode(':', $apiKey);
        Http::withBasicAuth($sid, $token)
            ->post("https://api.twilio.com/2010-04-01/Accounts/$sid/Messages.json", [
                'From' => "whatsapp:$from",
                'To'   => "whatsapp:$phone",
                'Body' => $message,
            ]);
    }
}
