<?php

namespace App\Services;

use App\Models\Tenant;
use App\Services\Integrations\GreenApiService;
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
        app()->instance('current_tenant_id', $tenantId);

        $phone   = $context['phone'] ?? null;
        $message = $action['message'] ?? '';

        if (! $phone) {
            Log::warning("WhatsApp automation: no phone for tenant $tenantId");
            return;
        }

        $svc = app(GreenApiService::class);

        if (! $svc->isConfigured()) {
            Log::warning("GREEN-API not configured for tenant $tenantId");
            return;
        }

        $svc->sendMessage($phone, $message);
    }
}
