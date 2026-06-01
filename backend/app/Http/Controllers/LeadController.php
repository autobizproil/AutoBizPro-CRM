<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreLeadRequest;
use App\Http\Requests\UpdateLeadRequest;
use App\Models\Activity;
use App\Models\Lead;
use App\Services\LeadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeadController extends Controller
{
    public function __construct(private LeadService $service) {}

    public function index(Request $request): JsonResponse
    {
        $leads = $this->service->list(
            $request->only(['stage_id', 'assigned_to', 'source', 'search', 'status']),
            $request->user()->id,
            $request->user()->role
        );

        return response()->json(['success' => true, 'data' => $leads]);
    }

    public function store(StoreLeadRequest $request): JsonResponse
    {
        $lead = $this->service->create($request->validated());
        return response()->json(['success' => true, 'data' => $lead], 201);
    }

    public function show(Lead $lead): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $lead->load(['stage', 'assignedUser'])]);
    }

    public function update(UpdateLeadRequest $request, Lead $lead): JsonResponse
    {
        $lead = $this->service->update($lead, $request->validated());
        return response()->json(['success' => true, 'data' => $lead]);
    }

    public function destroy(Lead $lead): JsonResponse
    {
        $lead->delete(); // soft delete
        return response()->json(['success' => true, 'data' => null]);
    }

    public function changeStage(Request $request, Lead $lead): JsonResponse
    {
        $request->validate(['stage_id' => 'required|integer|exists:pipeline_stages,id']);
        $lead = $this->service->changeStage($lead, $request->stage_id);
        return response()->json(['success' => true, 'data' => $lead]);
    }

    public function activities(Lead $lead): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $lead->activities]);
    }

    public function storeActivity(Request $request, Lead $lead): JsonResponse
    {
        $data = $request->validate([
            'type' => 'required|in:call,note,email,meeting,task',
            'body' => 'required|string',
        ], [
            'type.required' => 'סוג הפעילות הוא שדה חובה',
            'body.required' => 'תוכן הפעילות הוא שדה חובה',
        ]);

        $activity = Activity::create([
            'tenant_id'   => app('current_tenant_id'),
            'entity_type' => 'lead',
            'entity_id'   => $lead->id,
            'user_id'     => $request->user()->id,
            ...$data,
        ]);

        return response()->json(['success' => true, 'data' => $activity], 201);
    }
}
