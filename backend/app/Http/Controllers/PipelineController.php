<?php

namespace App\Http\Controllers;

use App\Models\PipelineStage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PipelineController extends Controller
{
    public function index(): JsonResponse
    {
        $stages = PipelineStage::with(['leads' => fn ($q) => $q->with('assignedUser')])
            ->orderBy('position')
            ->get();

        return response()->json(['success' => true, 'data' => $stages]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'     => 'required|string|max:255',
            'color'    => 'nullable|string|max:20',
            'position' => 'nullable|integer',
            'type'     => 'nullable|in:lead,sales,custom',
        ], ['name.required' => 'שם השלב הוא שדה חובה']);

        $stage = PipelineStage::create($data);
        return response()->json(['success' => true, 'data' => $stage], 201);
    }

    public function update(Request $request, PipelineStage $pipeline): JsonResponse
    {
        $data = $request->validate([
            'name'  => 'sometimes|required|string|max:255',
            'color' => 'nullable|string|max:20',
            'type'  => 'nullable|in:lead,sales,custom',
        ]);

        $pipeline->update($data);
        return response()->json(['success' => true, 'data' => $pipeline->fresh()]);
    }

    public function destroy(PipelineStage $pipeline): JsonResponse
    {
        $pipeline->delete();
        return response()->json(['success' => true, 'data' => null]);
    }

    public function reorder(Request $request): JsonResponse
    {
        $request->validate([
            'stages'          => 'required|array',
            'stages.*.id'     => 'required|integer',
            'stages.*.position' => 'required|integer',
        ]);

        foreach ($request->stages as $item) {
            PipelineStage::where('id', $item['id'])->update(['position' => $item['position']]);
        }

        return response()->json(['success' => true, 'data' => null]);
    }
}
