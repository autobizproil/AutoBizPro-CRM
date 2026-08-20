<?php

namespace App\Http\Controllers;

use App\Models\PipelineStage;
use App\Models\RecordType;
use App\Models\User;
use App\Services\Reporting\EntityDescriptor;
use App\Services\Reporting\RelativeDateRange;
use App\Services\Reporting\WidgetDataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WidgetController extends Controller
{
    private const AGGREGATIONS = [
        ['id' => 'count', 'label' => 'מספר רשומות'],
        ['id' => 'sum',   'label' => 'סכום'],
        ['id' => 'avg',   'label' => 'ממוצע'],
        ['id' => 'max',   'label' => 'מקסימום'],
        ['id' => 'min',   'label' => 'מינימום'],
    ];

    /**
     * GET /dashboard/widget-fields
     * Metadata the widget builder needs to render its inputs: entities, their
     * fields, the relative-date operator list, aggregations, and lookup options.
     */
    public function fields(WidgetDataService $service): JsonResponse
    {
        $entities = [];
        $fields   = [];

        foreach (EntityDescriptor::all() as $key => $d) {
            $entities[]   = ['key' => $key, 'label' => $d['label']];
            $fields[$key] = [
                'valueFields'  => $d['valueFields'],
                'groupFields'  => $d['groupFields'],
                'filterFields' => $d['filterFields'],
                'dateFields'   => $d['dateFields'],
            ];
        }

        // Tenant's own custom record types (e.g. "חשבוניות") are widget-buildable
        // entities too, keyed "record:<slug>" so they never collide with the
        // fixed built-in entity keys above.
        $recordTypes = RecordType::where('tenant_id', app('current_tenant_id'))->orderBy('position')->get();
        foreach ($recordTypes as $rt) {
            $d = $service->buildRecordDescriptor($rt->slug);
            if ($d === null) {
                continue;
            }
            $key = "record:{$rt->slug}";
            $entities[]   = ['key' => $key, 'label' => $d['label']];
            $fields[$key] = [
                'valueFields'  => $d['valueFields'],
                'groupFields'  => $d['groupFields'],
                'filterFields' => $d['filterFields'],
                'dateFields'   => $d['dateFields'],
            ];
        }

        // Payment-lines pseudo-entities — "all invoice types combined" plus one
        // per record type flagged has_payment_lines, so "by payment type"
        // breakdowns are buildable the same generic way as any other entity.
        $allPayments = $service->buildPaymentDescriptor(null);
        if ($allPayments !== null) {
            $entities[]            = ['key' => 'payments:all', 'label' => $allPayments['label']];
            $fields['payments:all'] = [
                'valueFields'  => $allPayments['valueFields'],
                'groupFields'  => $allPayments['groupFields'],
                'filterFields' => $allPayments['filterFields'],
                'dateFields'   => $allPayments['dateFields'],
            ];

            foreach ($recordTypes->where('has_payment_lines', true) as $rt) {
                $d = $service->buildPaymentDescriptor($rt->slug);
                if ($d === null) {
                    continue;
                }
                $key = "payments:{$rt->slug}";
                $entities[]   = ['key' => $key, 'label' => $d['label']];
                $fields[$key] = [
                    'valueFields'  => $d['valueFields'],
                    'groupFields'  => $d['groupFields'],
                    'filterFields' => $d['filterFields'],
                    'dateFields'   => $d['dateFields'],
                ];
            }
        }

        $dateOperators = [];
        foreach (RelativeDateRange::OPERATORS as $id => $label) {
            $dateOperators[] = [
                'id'         => $id,
                'label'      => $label,
                'needsValue' => RelativeDateRange::needsValue($id),
            ];
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'entities'      => $entities,
                'fields'        => $fields,
                'dateOperators' => $dateOperators,
                'aggregations'  => self::AGGREGATIONS,
                'lookups'       => [
                    'users'  => User::query()->where('is_service', false)->get(['id', 'name']),
                    'stages' => PipelineStage::query()->orderBy('position')->get(['id', 'name', 'color']),
                ],
            ],
        ]);
    }

    /**
     * GET /dashboard/widget-data
     * Runs one widget's aggregation. timePeriod and conditions arrive JSON-encoded.
     */
    public function data(Request $request, WidgetDataService $service): JsonResponse
    {
        $config = [
            'entity'       => (string) $request->input('entity', ''),
            'valueField'   => $request->input('valueField'),
            'aggregation'  => $request->input('aggregation', 'count'),
            'displayField' => $request->input('displayField'),
            'displayGranularity' => $request->input('displayGranularity'),
            'timePeriod'   => $this->decodeJson($request->input('timePeriod')),
            'conditions'   => $this->decodeJson($request->input('conditions')) ?? [],
            'orConditions' => $this->decodeJson($request->input('orConditions')) ?? [],
            'groupBy'      => $this->decodeJson($request->input('groupBy')),
        ];

        try {
            $data = $service->aggregate($config, $request->user());
        } catch (\InvalidArgumentException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }

        return response()->json(['success' => true, 'data' => $data]);
    }

    private function decodeJson(?string $raw): ?array
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : null;
    }
}
