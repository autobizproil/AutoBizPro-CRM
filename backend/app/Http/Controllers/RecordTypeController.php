<?php

namespace App\Http\Controllers;

use App\Models\CustomFieldDefinition;
use App\Models\RecordType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class RecordTypeController extends Controller
{
    // Built-in entities — a custom record type may not shadow them
    private const RESERVED_SLUGS = ['leads', 'clients', 'contacts', 'tasks'];

    public function index(): JsonResponse
    {
        $types = RecordType::withCount('records')->orderBy('position')->orderBy('id')->get();
        return response()->json(['success' => true, 'data' => $types]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'label'          => 'required|string|max:120',
            'label_singular' => 'nullable|string|max:120',
            'icon'           => 'nullable|string|max:16',
        ], [
            'label.required' => 'שם הרשומה הוא שדה חובה',
        ]);

        // Machine slug from label; Hebrew labels fall back to a random slug
        $slugged = Str::slug(str_replace(['/', '\\', '"', "'"], '_', $data['label']), '_');
        $base    = ltrim($slugged, '_') ?: 'rt_' . Str::lower(Str::random(6));
        if (in_array($base, self::RESERVED_SLUGS, true)) {
            $base .= '_custom';
        }

        $slug = $base;
        $i    = 2;
        while (RecordType::where('slug', $slug)->exists()) {
            $slug = "{$base}_{$i}";
            $i++;
        }

        $maxPos = RecordType::max('position') ?? -1;

        $type = RecordType::create([
            'slug'           => $slug,
            'label'          => $data['label'],
            'label_singular' => $data['label_singular'] ?? null,
            'icon'           => $data['icon'] ?? null,
            'position'       => $maxPos + 1,
        ]);

        // Seed one system field so the record has a primary display column
        CustomFieldDefinition::create([
            'tenant_id'  => app('current_tenant_id'),
            'entity'     => $slug,
            'name'       => 'title',
            'label'      => 'שם',
            'field_type' => 'text',
            'is_system'  => true,
            'sort_order' => 0,
        ]);

        return response()->json(['success' => true, 'data' => $type], 201);
    }

    public function update(Request $request, RecordType $recordType): JsonResponse
    {
        abort_unless($recordType->tenant_id === app('current_tenant_id'), 403);

        $data = $request->validate([
            'label'          => 'sometimes|required|string|max:120',
            'label_singular' => 'nullable|string|max:120',
            'icon'           => 'nullable|string|max:16',
            'position'       => 'sometimes|integer|min:0',
        ]);

        $recordType->update($data);

        return response()->json(['success' => true, 'data' => $recordType->fresh()]);
    }

    public function destroy(RecordType $recordType): JsonResponse
    {
        abort_unless($recordType->tenant_id === app('current_tenant_id'), 403);

        // Records cascade via FK; field definitions cleaned up explicitly
        CustomFieldDefinition::where('tenant_id', app('current_tenant_id'))
            ->where('entity', $recordType->slug)
            ->delete();

        $recordType->delete();

        return response()->json(['success' => true, 'data' => null]);
    }
}
