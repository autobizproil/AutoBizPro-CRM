<?php

namespace App\Http\Controllers;

use App\Models\CustomFieldDefinition;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CustomFieldController extends Controller
{
    private const ALLOWED_TYPES = ['text', 'number', 'select', 'date', 'checkbox', 'url', 'phone', 'email', 'textarea'];

    /** System fields — always shown, cannot be deleted. */
    public const SYSTEM_FIELDS = [
        ['name' => 'name',               'label' => 'שם מלא',         'field_type' => 'text',     'system' => true],
        ['name' => 'phone',              'label' => 'טלפון',           'field_type' => 'phone',    'system' => true],
        ['name' => 'email',              'label' => 'דוא"ל',           'field_type' => 'email',    'system' => true],
        ['name' => 'source',             'label' => 'מקור הגעה',       'field_type' => 'text',     'system' => true],
        ['name' => 'pipeline_stage_id',  'label' => 'סטטוס (שלב)',     'field_type' => 'lookup',   'system' => true],
        ['name' => 'assigned_to',        'label' => 'נציג אחראי',      'field_type' => 'lookup',   'system' => true],
        ['name' => 'notes',              'label' => 'הערות',            'field_type' => 'textarea', 'system' => true],
        ['name' => 'created_at',         'label' => 'נוצר בתאריך',     'field_type' => 'datetime', 'system' => true],
        ['name' => 'updated_at',         'label' => 'עודכן בתאריך',    'field_type' => 'datetime', 'system' => true],
    ];

    public function index(): JsonResponse
    {
        $tenantId = app('current_tenant_id');

        $custom = CustomFieldDefinition::where('tenant_id', $tenantId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn ($f) => [...$f->toArray(), 'system' => false]);

        return response()->json([
            'success' => true,
            'data'    => [
                'system' => self::SYSTEM_FIELDS,
                'custom' => $custom,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = app('current_tenant_id');

        $data = $request->validate([
            'label'      => 'required|string|max:120',
            'field_type' => 'required|in:' . implode(',', self::ALLOWED_TYPES),
            'options'    => 'nullable|array',
            'options.*'  => 'string|max:100',
            'required'   => 'boolean',
        ]);

        // Auto-generate machine name from label (fallback for Hebrew/non-ASCII labels)
        $slugged = Str::slug(str_replace(['/', '\\', '"', "'"], '_', $data['label']), '_');
        $base    = $slugged ?: 'cf_' . Str::lower(Str::random(6));
        $base    = ltrim($base, '_') ?: 'cf_' . Str::lower(Str::random(6));

        $name = $base;
        $i    = 2;
        $systemNames = array_column(self::SYSTEM_FIELDS, 'name');
        while (
            CustomFieldDefinition::where('tenant_id', $tenantId)->where('name', $name)->exists()
            || in_array($name, $systemNames, true)
        ) {
            $name = "{$base}_{$i}";
            $i++;
        }

        $maxOrder = CustomFieldDefinition::where('tenant_id', $tenantId)->max('sort_order') ?? -1;

        $field = CustomFieldDefinition::create([
            'tenant_id'  => $tenantId,
            'name'       => $name,
            'label'      => $data['label'],
            'field_type' => $data['field_type'],
            'options'    => $data['options'] ?? null,
            'required'   => $data['required'] ?? false,
            'sort_order' => $maxOrder + 1,
        ]);

        return response()->json(['success' => true, 'data' => [...$field->toArray(), 'system' => false]], 201);
    }

    public function update(Request $request, CustomFieldDefinition $customFieldDefinition): JsonResponse
    {
        abort_unless($customFieldDefinition->tenant_id === app('current_tenant_id'), 403);

        $data = $request->validate([
            'label'     => 'sometimes|string|max:120',
            'options'   => 'nullable|array',
            'options.*' => 'string|max:100',
            'required'  => 'boolean',
        ]);

        $customFieldDefinition->update($data);

        return response()->json(['success' => true, 'data' => [...$customFieldDefinition->fresh()->toArray(), 'system' => false]]);
    }

    public function destroy(CustomFieldDefinition $customFieldDefinition): JsonResponse
    {
        abort_unless($customFieldDefinition->tenant_id === app('current_tenant_id'), 403);
        $customFieldDefinition->delete();
        return response()->json(['success' => true, 'data' => null]);
    }
}
