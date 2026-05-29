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
            $request->only(['stage_id', 'assigned_to', 'source', 'search']),
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

    public function bulk(Request $request): JsonResponse
    {
        $tenantId = app('current_tenant_id');
        $data = $request->validate([
            'action' => 'required|in:change_stage,assign,delete',
            'ids'    => 'required|array|min:1',
            'ids.*'  => 'integer',
            'value'  => 'nullable|integer',
        ]);

        // Validate the target value against the current tenant where relevant
        if ($data['action'] === 'change_stage') {
            $request->validate(['value' => ['required', \Illuminate\Validation\Rule::exists('pipeline_stages', 'id')->where('tenant_id', $tenantId)]]);
        } elseif ($data['action'] === 'assign') {
            $request->validate(['value' => ['required', \Illuminate\Validation\Rule::exists('users', 'id')->where('tenant_id', $tenantId)]]);
        }

        $affected = $this->service->bulk(
            $data['action'],
            $data['ids'],
            $data['value'] ?? null,
            $request->user()->id,
            $request->user()->role,
        );

        return response()->json(['success' => true, 'data' => ['affected' => $affected]]);
    }

    public function show(Request $request, Lead $lead): JsonResponse
    {
        $this->authorizeLead($request, $lead);
        return response()->json(['success' => true, 'data' => $lead->load(['stage', 'assignedUser'])]);
    }

    public function update(UpdateLeadRequest $request, Lead $lead): JsonResponse
    {
        $this->authorizeLead($request, $lead);
        $lead = $this->service->update($lead, $request->validated());
        return response()->json(['success' => true, 'data' => $lead]);
    }

    public function destroy(Request $request, Lead $lead): JsonResponse
    {
        $this->authorizeLead($request, $lead);
        $lead->delete(); // soft delete
        return response()->json(['success' => true, 'data' => null]);
    }

    public function changeStage(Request $request, Lead $lead): JsonResponse
    {
        $this->authorizeLead($request, $lead);
        $request->validate([
            'stage_id' => ['required', 'integer', \Illuminate\Validation\Rule::exists('pipeline_stages', 'id')->where('tenant_id', app('current_tenant_id'))],
        ]);
        $lead = $this->service->changeStage($lead, $request->stage_id);
        return response()->json(['success' => true, 'data' => $lead]);
    }

    public function activities(Request $request, Lead $lead): JsonResponse
    {
        $this->authorizeLead($request, $lead);
        return response()->json(['success' => true, 'data' => $lead->activities]);
    }

    /**
     * Tenant binding is enforced by the global scope; here we enforce the
     * agent-ownership rule — agents may only touch leads assigned to them.
     */
    private function authorizeLead(Request $request, Lead $lead): void
    {
        $user = $request->user();
        if ($user->role === 'agent') {
            abort_unless($lead->assigned_to === $user->id, 403);
        }
    }

    public function storeActivity(Request $request, Lead $lead): JsonResponse
    {
        $this->authorizeLead($request, $lead);

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
