<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\Lead;
use App\Models\Tenant;
use App\Services\Integrations\CardcomService;
use App\Services\Integrations\GreenApiService;
use App\Services\Integrations\GreenInvoiceApi;
use App\Services\Integrations\PaycallService;
use App\Services\Integrations\YeshInvoiceService;
use App\Services\PhoneNormalizer;
use App\Services\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class IntegrationsController extends Controller
{
    /** Keys we allow tenants to store for integrations (whitelist). */
    private const INTEGRATION_KEYS = [
        'greeninvoice_api_key_id',
        'greeninvoice_api_key_secret',
        'greeninvoice_sandbox',
        'greenapi_instance_id',
        'greenapi_token',
        'cardcom_terminal',
        'cardcom_api_name',
        'cardcom_api_password',
        'yesh_user_key',
        'yesh_secret_key',
        'paycall_enabled',
        'paycall_did',
        'paycall_secret',
    ];

    /** Substring match -> value masked in responses, masked echoes ignored on save. */
    private static function isSecretKey(string $key): bool
    {
        return str_contains($key, 'secret')
            || str_contains($key, 'token')
            || str_contains($key, 'password')
            || str_ends_with($key, '_key');   // e.g. yesh_user_key, yesh_secret_key — but NOT greeninvoice_api_key_id
    }

    public function getSettings(): JsonResponse
    {
        $settings = app(SettingsService::class);
        $data = [];
        foreach (self::INTEGRATION_KEYS as $k) {
            $val = $settings->get($k);
            // Mask secrets in the response — never echo full secret back
            if (self::isSecretKey($k) && $val) {
                $val = '****' . substr($val, -4);
            }
            $data[$k] = $val;
        }
        return response()->json(['success' => true, 'data' => $data]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $settings = app(SettingsService::class);
        foreach (self::INTEGRATION_KEYS as $k) {
            if ($request->has($k)) {
                $val = $request->input($k);
                // Ignore masked secret echoes (don't overwrite with ****1234)
                if (self::isSecretKey($k) && is_string($val) && str_starts_with($val, '****')) {
                    continue;
                }
                $settings->set($k, $val);
            }
        }
        return response()->json(['success' => true, 'data' => null]);
    }

    public function greenInvoiceTest(): JsonResponse
    {
        $result = (new GreenInvoiceApi())->testConnection();
        if ($result['status'] === 'success') {
            return response()->json(['success' => true, 'message' => 'מחובר בהצלחה ל-Green Invoice ✓']);
        }
        return response()->json(['success' => false, 'message' => $result['message'] ?? 'שגיאת חיבור']);
    }

    public function greenInvoiceCreate(Request $request, Lead $lead): JsonResponse
    {
        abort_unless($lead->tenant_id === app('current_tenant_id'), 403);

        $data = $request->validate([
            'type'        => 'required|integer|in:305,330,400,320',
            'items'       => 'required|array|min:1',
            'items.*.description' => 'required|string',
            'items.*.price'       => 'required|numeric',
            'items.*.quantity'    => 'required|numeric',
            'tax_id'      => 'nullable|string',
        ]);

        $client = ['name' => $lead->name, 'phone' => $lead->phone ?? '', 'add' => false];
        if ($lead->email)        $client['emails'] = [$lead->email];
        if (!empty($data['tax_id'])) $client['taxId'] = $data['tax_id'];

        $income = [];
        $total  = 0.0;
        foreach ($data['items'] as $it) {
            $income[] = [
                'description' => $it['description'],
                'price'       => (float) $it['price'],
                'quantity'    => (float) $it['quantity'],
                'vatType'     => 0,
            ];
            $total += (float) $it['price'] * (float) $it['quantity'];
        }

        $payload = ['type' => (int) $data['type'], 'client' => $client, 'income' => $income];

        // Types 330 (חשבונית מס קבלה) and 400 (קבלה) record a payment
        if (in_array((int) $data['type'], [330, 400], true) && $total > 0) {
            $payload['payment'] = [[
                'method' => 1, // cash
                'amount' => round($total, 2),
                'date'   => time() * 1000,
            ]];
        }

        $result = (new GreenInvoiceApi())->createInvoice($payload);

        if ($result['status'] === 'success' && !empty($result['document_id'])) {
            $url = $result['data']['url']['origin'] ?? $result['data']['url']['he'] ?? null;

            // Log on the lead timeline
            Activity::create([
                'tenant_id'   => $lead->tenant_id,
                'entity_type' => 'lead',
                'entity_id'   => $lead->id,
                'user_id'     => $request->user()->id,
                'type'        => 'note',
                'body'        => 'הופקה חשבונית Green Invoice #' . $result['document_id'] . ($url ? " — $url" : ''),
            ]);

            return response()->json(['success' => true, 'data' => [
                'document_id' => $result['document_id'],
                'url'         => $url,
            ]]);
        }

        return response()->json([
            'success' => false,
            'message' => $result['message'] ?? 'שגיאה ביצירת החשבונית',
        ], 422);
    }

    // =====================================================================
    //  WhatsApp (GREEN-API) — ported from Taskey taskey_api/green_api
    // =====================================================================

    public function whatsappTest(): JsonResponse
    {
        $result = (new GreenApiService())->testConnection();
        if ($result['status'] === 'success') {
            return response()->json(['success' => true, 'message' => 'מחובר ל-WhatsApp ✓ (' . ($result['state'] ?? 'authorized') . ')']);
        }
        return response()->json(['success' => false, 'message' => $result['message'] ?? 'שגיאת חיבור']);
    }

    public function whatsappSend(Request $request, Lead $lead): JsonResponse
    {
        abort_unless($lead->tenant_id === app('current_tenant_id'), 403);

        $data = $request->validate([
            'message' => 'required|string|max:4096',
        ]);

        if (empty($lead->phone)) {
            return response()->json(['success' => false, 'message' => 'לליד אין מספר טלפון'], 422);
        }

        $api = new GreenApiService();
        if (!$api->isConfigured()) {
            return response()->json(['success' => false, 'message' => 'WhatsApp לא מוגדר — הזן פרטי GREEN-API בהגדרות'], 422);
        }

        $result = $api->sendMessage($lead->phone, $data['message']);

        if ($result['status'] === 'success') {
            Activity::create([
                'tenant_id'   => $lead->tenant_id,
                'entity_type' => 'lead',
                'entity_id'   => $lead->id,
                'user_id'     => $request->user()->id,
                'type'        => 'whatsapp',
                'body'        => '📤 ' . $data['message'],
            ]);

            return response()->json(['success' => true, 'data' => ['message_id' => $result['message_id'] ?? null]]);
        }

        return response()->json(['success' => false, 'message' => $result['message'] ?? 'שליחה נכשלה'], 422);
    }

    /**
     * Public webhook GREEN-API calls on incoming/outgoing messages. Resolves
     * the tenant from the URL (no auth/session). Logs incoming text messages on
     * the matching lead's timeline and auto-creates a lead by phone if missing.
     *
     * Slim port of Taskey green_api_receive_notification() — the client-specific
     * source/keyword glue (bmg/katerina/dr-wattad/…) is intentionally dropped.
     */
    public function whatsappWebhook(Request $request, string $tenant): JsonResponse
    {
        $tenantModel = Tenant::where('subdomain', $tenant)->first();
        if (!$tenantModel) {
            return response()->json(['success' => false], 404);
        }
        app()->instance('current_tenant_id', $tenantModel->id);

        $body        = $request->all();
        $typeWebhook = $body['typeWebhook'] ?? '';

        // Only act on inbound text-bearing messages
        if ($typeWebhook !== 'incomingMessageReceived') {
            return response()->json(['success' => true]);
        }

        $chatId = $body['senderData']['chatId'] ?? '';
        // Ignore group chats
        if ($chatId === '' || str_contains($chatId, '@g.us')) {
            return response()->json(['success' => true]);
        }

        $md   = $body['messageData'] ?? [];
        $text = $md['textMessageData']['textMessage']
            ?? $md['extendedTextMessageData']['text']
            ?? $md['caption']
            ?? '';

        $phone = PhoneNormalizer::normalize(preg_replace('/@c\.us$/', '', $chatId));
        if (empty($phone)) {
            return response()->json(['success' => true]);
        }

        $lead = Lead::where('phone_normalized', $phone)->first();

        if (!$lead) {
            $name   = $body['senderData']['senderContactName'] ?? $body['senderData']['senderName'] ?? '';
            $source = app(SettingsService::class)->get('whatsapp_default_source', 'WhatsApp');
            $lead = Lead::create([
                'tenant_id' => $tenantModel->id,
                'name'      => $name !== '' ? $name : $phone,
                'phone'     => $phone,
                'source'    => $source,
                'status'    => 'new',
            ]);
        }

        if ($text !== '') {
            Activity::create([
                'tenant_id'   => $lead->tenant_id,
                'entity_type' => 'lead',
                'entity_id'   => $lead->id,
                'type'        => 'whatsapp',
                'body'        => '📥 ' . $text,
            ]);
        }

        return response()->json(['success' => true]);
    }

    // =====================================================================
    //  Cardcom payment — ported from Taskey taskey_purchases/cardcom_api
    // =====================================================================

    /**
     * Create a Cardcom hosted charge page for a lead.
     *
     * POST /api/integrations/cardcom/lead/{lead}
     * Body: { amount: numeric >= 1, description: string }
     *
     * Returns: { success, data: { url, low_profile_code } }
     */
    public function cardcomCreatePage(Request $request, Lead $lead): JsonResponse
    {
        abort_unless($lead->tenant_id === app('current_tenant_id'), 403);

        $data = $request->validate([
            'amount'      => 'required|numeric|min:1',
            'description' => 'required|string|max:500',
        ]);

        $cardcom = app(CardcomService::class);

        if (!$cardcom->isConfigured()) {
            return response()->json(['success' => false, 'message' => 'Cardcom לא מוגדר — הזן מסוף, שם API וסיסמת API בהגדרות'], 422);
        }

        // Build indicator (webhook) URL so Cardcom can POST back on completion
        $tenantSubdomain = Tenant::find($lead->tenant_id)?->subdomain ?? 'unknown';
        $indicatorUrl = url("/api/integrations/cardcom/result/{$tenantSubdomain}");

        $result = $cardcom->createChargePage([
            'amount'        => (float) $data['amount'],
            'description'   => $data['description'],
            'indicator_url' => $indicatorUrl,
            'email'         => $lead->email  ?? '',
            'name'          => $lead->name   ?? '',
            'phone'         => $lead->phone  ?? '',
            'return_value'  => (string) $lead->id,
        ]);

        if ($result['status'] === 'success') {
            // Log on timeline that a charge page was created (not yet paid)
            Activity::create([
                'tenant_id'   => $lead->tenant_id,
                'entity_type' => 'lead',
                'entity_id'   => $lead->id,
                'user_id'     => $request->user()->id,
                'type'        => 'payment',
                'body'        => 'נוצרה דף תשלום Cardcom — ' . number_format((float) $data['amount'], 2) . ' ₪ — ' . $data['description'],
            ]);

            return response()->json(['success' => true, 'data' => [
                'url'              => $result['url'],
                'low_profile_code' => $result['low_profile_code'],
            ]]);
        }

        return response()->json([
            'success' => false,
            'message' => $result['message'] ?? 'שגיאה ביצירת דף תשלום Cardcom',
        ], 422);
    }

    /**
     * Public Cardcom result webhook — GET or POST, no auth required.
     *
     * Route: /api/integrations/cardcom/result/{tenant}
     *
     * Cardcom POSTs (or GETs) this URL after a payment attempt.
     * We resolve the tenant from the URL slug, look up the lead by
     * ReturnValue (= lead.id), and log an Activity of type 'payment'.
     *
     * Security note: we call getTransaction() to verify the result with
     * Cardcom's servers rather than trusting the client-supplied data.
     */
    // =====================================================================
    //  Yesh Invoice (יש חשבונית) — ported from Taskey yeshinvoice_api
    // =====================================================================

    /**
     * Test connectivity / configuration for Yesh Invoice.
     *
     * POST /api/integrations/yeshinvoice/test
     */
    public function yeshInvoiceTest(): JsonResponse
    {
        $result = app(YeshInvoiceService::class)->testConnection();
        if ($result['status'] === 'success') {
            return response()->json(['success' => true, 'message' => $result['message']]);
        }
        return response()->json(['success' => false, 'message' => $result['message'] ?? 'שגיאת חיבור']);
    }

    /**
     * Create an invoice document on Yesh Invoice for a lead.
     *
     * POST /api/integrations/yeshinvoice/lead/{lead}
     *
     * Body (all optional except items):
     *   title         string
     *   notes         string
     *   document_type int      — default 1 (invoice)
     *   currency_id   int      — 1=ILS (default)
     *   vat_percentage int     — default 17
     *   items         array    required — [{title, price, quantity}]
     *   customer_name string   — defaults to lead name
     *   send_email    bool
     *   send_sms      bool
     */
    public function yeshInvoiceCreate(Request $request, Lead $lead): JsonResponse
    {
        abort_unless($lead->tenant_id === app('current_tenant_id'), 403);

        $data = $request->validate([
            'title'          => 'nullable|string|max:255',
            'notes'          => 'nullable|string|max:1000',
            'document_type'  => 'nullable|integer',
            'currency_id'    => 'nullable|integer',
            'vat_percentage' => 'nullable|numeric|min:0',
            'items'          => 'required|array|min:1',
            'items.*.title'  => 'required|string',
            'items.*.price'  => 'required|numeric',
            'items.*.quantity' => 'nullable|numeric|min:0',
            'customer_name'  => 'nullable|string|max:255',
            'send_email'     => 'nullable|boolean',
            'send_sms'       => 'nullable|boolean',
        ]);

        // Build items in the Yesh Invoice format (mirrors Taskey documentData)
        $items = [];
        foreach ($data['items'] as $it) {
            $items[] = [
                'Title'      => $it['title'],
                'Price'      => (float) $it['price'],
                'TypeID'     => 1,
                'DealNumber' => '',
                'DueDate'    => date('Y-m-d'),
            ];
        }

        // Build payments: one entry per item (simple 1:1 like Taskey example)
        $payments = [];
        foreach ($data['items'] as $it) {
            $payments[] = [
                'Price'   => (float) $it['price'] * (float) ($it['quantity'] ?? 1),
                'TypeID'  => 1,
                'DueDate' => date('Y-m-d'),
            ];
        }

        $params = [
            'title'          => $data['title']          ?? '',
            'notes'          => $data['notes']           ?? '',
            'document_type'  => $data['document_type']  ?? 1,
            'currency_id'    => $data['currency_id']    ?? 1,
            'vat_percentage' => $data['vat_percentage'] ?? 17,
            'send_email'     => $data['send_email']     ?? false,
            'send_sms'       => $data['send_sms']       ?? false,
            'customer'       => ['Name' => $data['customer_name'] ?? $lead->name],
            'items'          => $items,
            'payments'       => $payments,
        ];

        $yesh   = app(YeshInvoiceService::class);
        $result = $yesh->createInvoice($params);

        if ($result['status'] === 'success' && !empty($result['document_id'])) {
            $url = $result['url'] ?? null;

            // Log on the lead timeline
            Activity::create([
                'tenant_id'   => $lead->tenant_id,
                'entity_type' => 'lead',
                'entity_id'   => $lead->id,
                'user_id'     => $request->user()->id,
                'type'        => 'note',
                'body'        => 'הופקה חשבונית Yesh Invoice #' . $result['document_id'] . ($url ? ' — ' . $url : ''),
            ]);

            return response()->json(['success' => true, 'data' => [
                'document_id' => $result['document_id'],
                'url'         => $url,
            ]]);
        }

        return response()->json([
            'success' => false,
            'message' => $result['message'] ?? 'שגיאה ביצירת החשבונית',
        ], 422);
    }

    public function cardcomResult(Request $request, string $tenant): JsonResponse
    {
        $tenantModel = Tenant::where('subdomain', $tenant)->first();
        if (!$tenantModel) {
            return response()->json(['success' => false], 404);
        }
        app()->instance('current_tenant_id', $tenantModel->id);

        // Cardcom sends LowProfileCode (or lowprofilecode — mixed case)
        $lowProfileCode = $request->input('LowProfileCode')
            ?? $request->input('lowprofilecode')
            ?? $request->input('lowProfileCode')
            ?? '';

        // ReturnValue was set to lead.id in cardcomCreatePage()
        $leadId = $request->input('ReturnValue')
            ?? $request->input('returnvalue')
            ?? $request->input('returnValue')
            ?? null;

        if (empty($lowProfileCode)) {
            Log::warning('Cardcom result webhook: missing LowProfileCode', $request->all());
            return response()->json(['success' => false, 'message' => 'missing LowProfileCode'], 422);
        }

        // Verify with Cardcom servers — do NOT trust client-supplied response codes
        $cardcom = app(CardcomService::class);
        $txResult = $cardcom->getTransaction($lowProfileCode);

        $responseCode = $txResult['response_code'] ?? null;
        $txData       = $txResult['data'] ?? [];
        $paid         = ($txResult['status'] === 'success');

        // Attempt to find the lead
        $lead = null;
        if ($leadId && is_numeric($leadId)) {
            $lead = Lead::find((int) $leadId);
            if ($lead && $lead->tenant_id !== $tenantModel->id) {
                $lead = null; // cross-tenant guard
            }
        }

        // Also try matching by InternalDealNumber / ReturnValue from Cardcom response
        if (!$lead && !empty($txData['ReturnValue']) && is_numeric($txData['ReturnValue'])) {
            $lead = Lead::find((int) $txData['ReturnValue']);
            if ($lead && $lead->tenant_id !== $tenantModel->id) {
                $lead = null;
            }
        }

        $statusLabel = $paid ? 'תשלום התקבל בהצלחה' : 'תשלום נכשל';
        $amount      = $txData['TotalPayments'] ?? $txData['DealSum'] ?? null;
        $amountStr   = $amount ? ' — ' . number_format((float) $amount, 2) . ' ₪' : '';

        Log::info('Cardcom result webhook', [
            'tenant'          => $tenant,
            'low_profile_code'=> $lowProfileCode,
            'paid'            => $paid,
            'response_code'   => $responseCode,
            'lead_id'         => $lead?->id,
        ]);

        if ($lead) {
            Activity::create([
                'tenant_id'   => $lead->tenant_id,
                'entity_type' => 'lead',
                'entity_id'   => $lead->id,
                'type'        => 'payment',
                'body'        => $statusLabel . $amountStr . ' (LowProfileCode: ' . $lowProfileCode . ')',
            ]);
        }

        return response()->json(['success' => true, 'paid' => $paid]);
    }

    // =====================================================================
    //  Paycall PBX — ported from Taskey paycall webhook handler
    // =====================================================================

    /**
     * Public Paycall webhook — Paycall POSTs call metadata here after each
     * call. No auth required; tenant resolved from URL segment.
     *
     * Route: POST /api/integrations/paycall/webhook/{tenant}
     *
     * Silently ignores calls when paycall_enabled !== '1' so Paycall never
     * gets a failure response that could cause retry storms.
     *
     * Optional secret verification: if paycall_secret setting is non-empty
     * we compare it against the X-Paycall-Secret request header.
     */
    public function paycallWebhook(Request $request, string $tenant): JsonResponse
    {
        $tenantModel = Tenant::where('subdomain', $tenant)->first();
        if (!$tenantModel) {
            return response()->json(['success' => false], 404);
        }
        app()->instance('current_tenant_id', $tenantModel->id);

        $paycall = app(PaycallService::class);

        if (!$paycall->isEnabled()) {
            return response()->json(['success' => true]);
        }

        // Optional secret verification
        $secret = app(SettingsService::class)->get('paycall_secret');
        if ($secret) {
            $provided = $request->header('X-Paycall-Secret', '');
            if (!hash_equals($secret, $provided)) {
                Log::warning('Paycall webhook: invalid secret', ['tenant' => $tenant]);
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 401);
            }
        }

        $result = $paycall->processWebhook($request->all());

        return response()->json(['success' => true, 'data' => $result]);
    }
}
