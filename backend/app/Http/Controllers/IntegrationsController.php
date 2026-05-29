<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\Lead;
use App\Services\Integrations\GreenInvoiceApi;
use App\Services\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IntegrationsController extends Controller
{
    /** Keys we allow tenants to store for integrations (whitelist). */
    private const INTEGRATION_KEYS = [
        'greeninvoice_api_key_id',
        'greeninvoice_api_key_secret',
        'greeninvoice_sandbox',
    ];

    public function getSettings(): JsonResponse
    {
        $settings = app(SettingsService::class);
        $data = [];
        foreach (self::INTEGRATION_KEYS as $k) {
            $val = $settings->get($k);
            // Mask secrets in the response — never echo full secret back
            if (str_contains($k, 'secret') && $val) {
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
                if (str_contains($k, 'secret') && is_string($val) && str_starts_with($val, '****')) {
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
}
