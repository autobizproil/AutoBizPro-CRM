<?php

namespace App\Http\Controllers;

use App\Models\CustomFieldDefinition;
use App\Models\Record;
use App\Models\RecordType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RecordController extends Controller
{
    private function fieldDefs(string $entity): array
    {
        return CustomFieldDefinition::where('tenant_id', app('current_tenant_id'))
            ->where('entity', $entity)
            ->get()
            ->keyBy('name')
            ->all();
    }

    public function index(Request $request, RecordType $recordType): JsonResponse
    {
        abort_unless($recordType->tenant_id === app('current_tenant_id'), 403);

        $query = Record::where('record_type_id', $recordType->id)->with('creator:id,name');

        if ($search = $request->query('search')) {
            $query->where('data', 'like', "%{$search}%");
        }

        $records = $query->orderByDesc('id')->paginate(25);

        return response()->json(['success' => true, 'data' => $records]);
    }

    public function store(Request $request, RecordType $recordType): JsonResponse
    {
        abort_unless($recordType->tenant_id === app('current_tenant_id'), 403);

        $data = $request->validate(['data' => 'required|array']);

        $fields = $this->fieldDefs($recordType->slug);
        foreach ($fields as $name => $def) {
            if ($def->required && empty($data['data'][$name] ?? null)) {
                return response()->json([
                    'success' => false,
                    'message' => "השדה \"{$def->label}\" הוא שדה חובה",
                ], 422);
            }
        }

        $record = Record::create([
            'record_type_id' => $recordType->id,
            'data'           => $data['data'],
            'created_by'     => $request->user()->id,
        ]);

        return response()->json(['success' => true, 'data' => $record->load('creator:id,name')], 201);
    }

    public function show(RecordType $recordType, Record $record): JsonResponse
    {
        abort_unless($recordType->tenant_id === app('current_tenant_id'), 403);
        abort_unless($record->record_type_id === $recordType->id, 404);

        return response()->json(['success' => true, 'data' => $record->load('creator:id,name')]);
    }

    public function update(Request $request, RecordType $recordType, Record $record): JsonResponse
    {
        abort_unless($recordType->tenant_id === app('current_tenant_id'), 403);
        abort_unless($record->record_type_id === $recordType->id, 404);

        $data = $request->validate(['data' => 'required|array']);

        $record->update(['data' => array_merge($record->data ?? [], $data['data'])]);

        return response()->json(['success' => true, 'data' => $record->fresh()->load('creator:id,name')]);
    }

    public function destroy(RecordType $recordType, Record $record): JsonResponse
    {
        abort_unless($recordType->tenant_id === app('current_tenant_id'), 403);
        abort_unless($record->record_type_id === $recordType->id, 404);

        $record->delete();

        return response()->json(['success' => true, 'data' => null]);
    }
}
