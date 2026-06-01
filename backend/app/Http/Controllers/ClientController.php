<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Services\AutomationEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ClientController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q     = $request->get('search', '');
        $query = Client::with(['assignedUser'])
            ->when($q, fn ($qr) => $qr->where(fn ($q2) =>
                $q2->where('name', 'like', "%$q%")
                   ->orWhere('phone', 'like', "%$q%")
                   ->orWhere('email', 'like', "%$q%")
                   ->orWhere('company', 'like', "%$q%")
            ))
            ->latest()
            ->paginate(25);

        return response()->json(['success' => true, 'data' => $query]);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = app('current_tenant_id');

        $data = $request->validate([
            'name'           => 'required|string|max:255',
            'phone'          => 'nullable|string|max:30',
            'email'          => 'nullable|email|max:255',
            'company'        => 'nullable|string|max:255',
            'source'         => 'nullable|string|max:100',
            'notes'          => 'nullable|string',
            'assigned_to'    => ['nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tenantId)],
            'source_lead_id' => ['nullable', 'integer', Rule::exists('leads', 'id')->where('tenant_id', $tenantId)],
            'custom_fields'  => 'nullable|array',
        ]);

        $client = Client::create(['tenant_id' => $tenantId] + $data);
        app(AutomationEngine::class)->fire('client_created', $client);

        return response()->json(['success' => true, 'data' => $client->load(['assignedUser'])], 201);
    }

    public function show(Client $client): JsonResponse
    {
        abort_unless($client->tenant_id === app('current_tenant_id'), 403);
        return response()->json(['success' => true, 'data' => $client->load(['assignedUser', 'sourceLead'])]);
    }

    public function update(Request $request, Client $client): JsonResponse
    {
        abort_unless($client->tenant_id === app('current_tenant_id'), 403);

        $tenantId = app('current_tenant_id');

        $data = $request->validate([
            'name'          => 'sometimes|required|string|max:255',
            'phone'         => 'nullable|string|max:30',
            'email'         => 'nullable|email|max:255',
            'company'       => 'nullable|string|max:255',
            'source'        => 'nullable|string|max:100',
            'notes'         => 'nullable|string',
            'assigned_to'   => ['nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tenantId)],
            'custom_fields' => 'nullable|array',
        ]);

        $client->update($data);
        return response()->json(['success' => true, 'data' => $client->fresh(['assignedUser'])]);
    }

    public function destroy(Client $client): JsonResponse
    {
        abort_unless($client->tenant_id === app('current_tenant_id'), 403);
        $client->delete();
        return response()->json(['success' => true, 'data' => null]);
    }

    /** Convert a lead to a client */
    public function convertLead(Request $request): JsonResponse
    {
        $tenantId = app('current_tenant_id');

        $data = $request->validate([
            'lead_id' => ['required', 'integer', Rule::exists('leads', 'id')->where('tenant_id', $tenantId)],
        ]);

        $lead = \App\Models\Lead::findOrFail($data['lead_id']);

        // Avoid duplicate conversion
        $existing = Client::where('tenant_id', $tenantId)
            ->where('source_lead_id', $lead->id)
            ->first();

        if ($existing) {
            return response()->json(['success' => true, 'data' => $existing->load(['assignedUser'])]);
        }

        $client = Client::create([
            'tenant_id'      => $tenantId,
            'name'           => $lead->name,
            'phone'          => $lead->phone,
            'email'          => $lead->email,
            'source'         => $lead->source,
            'notes'          => $lead->notes,
            'assigned_to'    => $lead->assigned_to,
            'source_lead_id' => $lead->id,
            'custom_fields'  => $lead->custom_fields,
        ]);

        return response()->json(['success' => true, 'data' => $client->load(['assignedUser'])], 201);
    }
}
