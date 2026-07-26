<?php

namespace App\Http\Controllers;

use App\Models\RecordType;
use App\Models\SavedView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SavedViewController extends Controller
{
    private const ENTITY_TYPES = ['leads', 'contacts', 'clients', 'tasks', 'records'];

    private function validated(Request $request, int $tenantId): array
    {
        $data = $request->validate([
            'entity_type'            => 'required|in:' . implode(',', self::ENTITY_TYPES),
            'entity_key'             => 'nullable|string|max:64',
            'name'                   => 'required|string|max:120',
            'search'                 => 'nullable|string|max:255',
            'date_from'              => 'nullable|date',
            'date_to'                => 'nullable|date',
            'conditions'             => 'nullable|array',
            'conditions.*.field'     => 'required_with:conditions|string',
            'conditions.*.operator'  => 'required_with:conditions|string',
            'conditions.*.value'     => 'nullable',
            'visible_columns'        => 'nullable|array',
        ]);

        if ($data['entity_type'] === 'records') {
            abort_unless(! empty($data['entity_key']), 422, 'entity_key נדרש עבור records');
            $exists = RecordType::where('tenant_id', $tenantId)->where('slug', $data['entity_key'])->exists();
            abort_unless($exists, 422, 'סוג רשומה לא חוקי');
        } else {
            $data['entity_key'] = null;
        }

        return $data;
    }

    /** Scope a query to the same (tenant, user, entity_type, entity_key) bucket as $view. */
    private function scopeToBucket($query, SavedView $view)
    {
        $query->where('tenant_id', $view->tenant_id)
            ->where('user_id', $view->user_id)
            ->where('entity_type', $view->entity_type);

        return $view->entity_key === null
            ? $query->whereNull('entity_key')
            : $query->where('entity_key', $view->entity_key);
    }

    public function index(Request $request): JsonResponse
    {
        $tenantId   = app('current_tenant_id');
        $entityType = $request->query('entity_type');
        abort_unless(in_array($entityType, self::ENTITY_TYPES, true), 422, 'entity_type לא חוקי');
        $entityKey = $request->query('entity_key');

        $query = SavedView::where('tenant_id', $tenantId)
            ->where('user_id', $request->user()->id)
            ->where('entity_type', $entityType);

        $query = $entityKey ? $query->where('entity_key', $entityKey) : $query->whereNull('entity_key');

        return response()->json(['success' => true, 'data' => $query->orderBy('name')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = app('current_tenant_id');
        $data     = $this->validated($request, $tenantId);

        $view = SavedView::create([
            'tenant_id'  => $tenantId,
            'user_id'    => $request->user()->id,
            'is_default' => false,
            ...$data,
        ]);

        return response()->json(['success' => true, 'data' => $view], 201);
    }

    public function update(Request $request, SavedView $savedView): JsonResponse
    {
        abort_unless($savedView->tenant_id === app('current_tenant_id'), 403);
        abort_unless($savedView->user_id === $request->user()->id, 403);

        $data = $this->validated($request, $savedView->tenant_id);
        $savedView->update($data);

        return response()->json(['success' => true, 'data' => $savedView->fresh()]);
    }

    public function destroy(Request $request, SavedView $savedView): JsonResponse
    {
        abort_unless($savedView->tenant_id === app('current_tenant_id'), 403);
        abort_unless($savedView->user_id === $request->user()->id, 403);

        $savedView->delete();

        return response()->json(['success' => true, 'data' => null]);
    }

    public function setDefault(Request $request, SavedView $savedView): JsonResponse
    {
        abort_unless($savedView->tenant_id === app('current_tenant_id'), 403);
        abort_unless($savedView->user_id === $request->user()->id, 403);

        DB::transaction(function () use ($savedView) {
            $this->scopeToBucket(SavedView::query(), $savedView)
                ->where('id', '!=', $savedView->id)
                ->update(['is_default' => false]);
            $savedView->update(['is_default' => true]);
        });

        return response()->json(['success' => true, 'data' => $savedView->fresh()]);
    }
}
