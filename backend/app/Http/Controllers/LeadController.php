<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreLeadRequest;
use App\Http\Requests\UpdateLeadRequest;
use App\Models\Activity;
use App\Models\Lead;
use App\Services\LeadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LeadController extends Controller
{
    public function __construct(private LeadService $service) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only(['stage_id', 'assigned_to', 'source', 'search', 'sort_by', 'sort_dir', 'date_from', 'date_to', 'date_field']);

        // conditions/orConditions arrive as JSON-encoded strings (query params), decode to arrays
        if ($request->filled('conditions')) {
            $decoded = json_decode($request->input('conditions'), true);
            $filters['conditions'] = is_array($decoded) ? $decoded : [];
        }
        if ($request->filled('orConditions')) {
            $decoded = json_decode($request->input('orConditions'), true);
            $filters['orConditions'] = is_array($decoded) ? $decoded : [];
        }

        $leads = $this->service->list($filters, $request->user()->id, $request->user()->role);

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
            $request->validate(['value' => ['required', Rule::exists('pipeline_stages', 'id')->where('tenant_id', $tenantId)]]);
        } elseif ($data['action'] === 'assign') {
            $request->validate(['value' => ['required', Rule::exists('users', 'id')->where('tenant_id', $tenantId)]]);
        } elseif ($data['action'] === 'delete') {
            // Bulk delete must require delete permission, not just update
            // (route guards can_update; deletion is a higher privilege)
            abort_unless(
                \App\Models\RolePermission::allows($tenantId, $request->user()->role, 'leads', 'can_delete'),
                403
            );
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
        $this->authorizeOwnership($request, $lead);
        return response()->json(['success' => true, 'data' => $lead->load(['stage', 'assignedUser'])]);
    }

    public function update(UpdateLeadRequest $request, Lead $lead): JsonResponse
    {
        $this->authorizeOwnership($request, $lead);
        $lead = $this->service->update($lead, $request->validated());
        return response()->json(['success' => true, 'data' => $lead]);
    }

    public function destroy(Request $request, Lead $lead): JsonResponse
    {
        $this->authorizeOwnership($request, $lead);
        $lead->delete(); // soft delete
        return response()->json(['success' => true, 'data' => null]);
    }

    public function changeStage(Request $request, Lead $lead): JsonResponse
    {
        $this->authorizeOwnership($request, $lead);
        $request->validate([
            'stage_id' => ['required', 'integer', Rule::exists('pipeline_stages', 'id')->where('tenant_id', app('current_tenant_id'))],
        ]);
        $lead = $this->service->changeStage($lead, $request->stage_id);
        return response()->json(['success' => true, 'data' => $lead]);
    }

    public function activities(Request $request, Lead $lead): JsonResponse
    {
        $this->authorizeOwnership($request, $lead);
        return response()->json(['success' => true, 'data' => $lead->activities]);
    }

    public function storeActivity(Request $request, Lead $lead): JsonResponse
    {
        $this->authorizeOwnership($request, $lead);

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

    private function authorizeOwnership(Request $request, Lead $lead): void
    {
        $user = $request->user();
        if ($user->role === 'agent' && (int) $lead->assigned_to !== (int) $user->id) {
            abort(403, 'Forbidden');
        }
    }
}
