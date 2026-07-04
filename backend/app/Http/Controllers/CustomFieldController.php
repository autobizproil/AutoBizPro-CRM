<?php

namespace App\Http\Controllers;

use App\Models\CustomFieldDefinition;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CustomFieldController extends Controller
{
    private const ALLOWED_TYPES    = ['text', 'textarea', 'number', 'select', 'date', 'datetime', 'checkbox', 'url', 'phone', 'email'];
    private const ALLOWED_ENTITIES = ['leads', 'clients', 'contacts', 'tasks'];

    /** System fields per entity — seeded per tenant on first access; editable label/hidden/order, not deletable. */
    public const SYSTEM_FIELDS = [
        'leads' => [
            ['name' => 'name',              'label' => 'שם מלא',       'field_type' => 'text'],
            ['name' => 'phone',             'label' => 'טלפון',         'field_type' => 'phone'],
            ['name' => 'email',             'label' => 'דוא"ל',         'field_type' => 'email'],
            ['name' => 'source',            'label' => 'מקור הגעה',     'field_type' => 'text'],
            ['name' => 'pipeline_stage_id', 'label' => 'סטטוס (שלב)',   'field_type' => 'lookup'],
            ['name' => 'assigned_to',       'label' => 'נציג אחראי',    'field_type' => 'lookup'],
            ['name' => 'notes',             'label' => 'הערות',          'field_type' => 'textarea'],
            ['name' => 'created_at',        'label' => 'נוצר בתאריך',   'field_type' => 'datetime'],
        ],
        'clients' => [
            ['name' => 'name',       'label' => 'שם לקוח',     'field_type' => 'text'],
            ['name' => 'phone',      'label' => 'טלפון',        'field_type' => 'phone'],
            ['name' => 'email',      'label' => 'דוא"ל',        'field_type' => 'email'],
            ['name' => 'status',     'label' => 'סטטוס',        'field_type' => 'text'],
            ['name' => 'notes',      'label' => 'הערות',         'field_type' => 'textarea'],
            ['name' => 'created_at', 'label' => 'נוצר בתאריך',  'field_type' => 'datetime'],
        ],
        'contacts' => [
            ['name' => 'name',       'label' => 'שם מלא',      'field_type' => 'text'],
            ['name' => 'phone',      'label' => 'טלפון',        'field_type' => 'phone'],
            ['name' => 'email',      'label' => 'דוא"ל',        'field_type' => 'email'],
            ['name' => 'company',    'label' => 'חברה',         'field_type' => 'text'],
            ['name' => 'role',       'label' => 'תפקיד',        'field_type' => 'text'],
            ['name' => 'notes',      'label' => 'הערות',         'field_type' => 'textarea'],
            ['name' => 'created_at', 'label' => 'נוצר בתאריך',  'field_type' => 'datetime'],
        ],
        'tasks' => [
            ['name' => 'title',       'label' => 'כותרת',        'field_type' => 'text'],
            ['name' => 'due_at',      'label' => 'תאריך יעד',    'field_type' => 'datetime'],
            ['name' => 'assigned_to', 'label' => 'אחראי',        'field_type' => 'lookup'],
            ['name' => 'status',      'label' => 'סטטוס',        'field_type' => 'text'],
            ['name' => 'notes',       'label' => 'הערות',         'field_type' => 'textarea'],
        ],
    ];

    private function entityOr404(Request $request): string
    {
        $entity = $request->query('entity', $request->input('entity', 'leads'));
        abort_unless(in_array($entity, self::ALLOWED_ENTITIES, true), 422, 'ישות לא חוקית');
        return $entity;
    }

    /** Seed missing system rows for tenant+entity (idempotent, self-healing). */
    private function seedSystemFields(int $tenantId, string $entity): void
    {
        $existing = CustomFieldDefinition::where('tenant_id', $tenantId)
            ->where('entity', $entity)->where('is_system', true)
            ->pluck('name')->all();

        $order = 0;
        foreach (self::SYSTEM_FIELDS[$entity] ?? [] as $f) {
            if (! in_array($f['name'], $existing, true)) {
                CustomFieldDefinition::create([
                    'tenant_id'  => $tenantId,
                    'entity'     => $entity,
                    'name'       => $f['name'],
                    'label'      => $f['label'],
                    'field_type' => $f['field_type'],
                    'is_system'  => true,
                    'sort_order' => $order,
                ]);
            }
            $order++;
        }
    }

    public function index(Request $request): JsonResponse
    {
        $tenantId = app('current_tenant_id');
        $entity   = $this->entityOr404($request);

        $this->seedSystemFields($tenantId, $entity);

        $fields = CustomFieldDefinition::where('tenant_id', $tenantId)
            ->where('entity', $entity)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json(['success' => true, 'data' => $fields]);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = app('current_tenant_id');
        $entity   = $this->entityOr404($request);

        $data = $request->validate([
            'label'      => 'required|string|max:120',
            'field_type' => 'required|in:' . implode(',', self::ALLOWED_TYPES),
            'options'    => 'nullable|array',
            'options.*'  => 'string|max:100',
            'required'   => 'boolean',
        ]);

        // Machine name from label; fallback for Hebrew/non-ASCII labels
        $slugged = Str::slug(str_replace(['/', '\\', '"', "'"], '_', $data['label']), '_');
        $base    = ltrim($slugged, '_') ?: 'cf_' . Str::lower(Str::random(6));

        $name = $base;
        $i    = 2;
        while (CustomFieldDefinition::where('tenant_id', $tenantId)->where('entity', $entity)->where('name', $name)->exists()) {
            $name = "{$base}_{$i}";
            $i++;
        }

        $maxOrder = CustomFieldDefinition::where('tenant_id', $tenantId)->where('entity', $entity)->max('sort_order') ?? -1;

        $field = CustomFieldDefinition::create([
            'tenant_id'  => $tenantId,
            'entity'     => $entity,
            'name'       => $name,
            'label'      => $data['label'],
            'field_type' => $data['field_type'],
            'options'    => $data['options'] ?? null,
            'required'   => $data['required'] ?? false,
            'sort_order' => $maxOrder + 1,
        ]);

        return response()->json(['success' => true, 'data' => $field], 201);
    }

    public function update(Request $request, CustomFieldDefinition $customFieldDefinition): JsonResponse
    {
        abort_unless($customFieldDefinition->tenant_id === app('current_tenant_id'), 403);

        $data = $request->validate([
            'label'      => 'sometimes|string|max:120',
            'field_type' => 'sometimes|in:' . implode(',', self::ALLOWED_TYPES),
            'options'    => 'nullable|array',
            'options.*'  => 'string|max:100',
            'required'   => 'boolean',
            'hidden'     => 'boolean',
        ]);

        // System fields: label / hidden / required only — never type or options
        if ($customFieldDefinition->is_system) {
            $data = array_intersect_key($data, array_flip(['label', 'hidden']));
        }

        $customFieldDefinition->update($data);

        return response()->json(['success' => true, 'data' => $customFieldDefinition->fresh()]);
    }

    /** Bulk reorder: { ids: [fieldId, ...] } in desired order. */
    public function reorder(Request $request): JsonResponse
    {
        $tenantId = app('current_tenant_id');
        $entity   = $this->entityOr404($request);

        $data = $request->validate(['ids' => 'required|array', 'ids.*' => 'integer']);

        foreach ($data['ids'] as $pos => $id) {
            CustomFieldDefinition::where('tenant_id', $tenantId)
                ->where('entity', $entity)
                ->where('id', $id)
                ->update(['sort_order' => $pos]);
        }

        return response()->json(['success' => true, 'data' => null]);
    }

    public function destroy(CustomFieldDefinition $customFieldDefinition): JsonResponse
    {
        abort_unless($customFieldDefinition->tenant_id === app('current_tenant_id'), 403);
        abort_if($customFieldDefinition->is_system, 422, 'שדה מערכת אינו ניתן למחיקה');
        $customFieldDefinition->delete();
        return response()->json(['success' => true, 'data' => null]);
    }
}
