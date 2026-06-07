<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreAutomationRequest;
use App\Models\Automation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AutomationController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['success' => true, 'data' => Automation::latest()->get()]);
    }

    public function store(StoreAutomationRequest $request): JsonResponse
    {
        $automation = Automation::create($request->validated());
        return response()->json(['success' => true, 'data' => $automation], 201);
    }

    public function show(Automation $automation): JsonResponse
    {
        abort_unless($automation->tenant_id === app('current_tenant_id'), 403);
        return response()->json(['success' => true, 'data' => $automation->load('logs')]);
    }

    public function update(StoreAutomationRequest $request, Automation $automation): JsonResponse
    {
        abort_unless($automation->tenant_id === app('current_tenant_id'), 403);
        $automation->update($request->validated());
        return response()->json(['success' => true, 'data' => $automation->fresh()]);
    }

    public function destroy(Automation $automation): JsonResponse
    {
        abort_unless($automation->tenant_id === app('current_tenant_id'), 403);
        $automation->delete();
        return response()->json(['success' => true, 'data' => null]);
    }

    public function toggle(Automation $automation): JsonResponse
    {
        abort_unless($automation->tenant_id === app('current_tenant_id'), 403);
        $automation->update(['active' => ! $automation->active]);
        return response()->json(['success' => true, 'data' => $automation->fresh()]);
    }
}
