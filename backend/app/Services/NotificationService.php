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
        $to = $context['email'] ?? null;

        if (! $to) {
            return;
        }

        // subject/body are already interpolated by RunAutomationJob::executeAction
        // before this is called — send exactly what the automation configured.
        $subject = $action['subject'] ?? 'הודעה מהמערכת';
        $body    = $action['body'] ?? '';

        Mail::raw($body, function ($msg) use ($to, $subject) {
            $msg->to($to)->subject($subject);
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
