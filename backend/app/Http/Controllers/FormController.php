<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreFormRequest;
use App\Models\Form;
use App\Models\FormSubmission;
use App\Models\Lead;
use App\Services\AutomationEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FormController extends Controller
{
    public function __construct(private AutomationEngine $automation) {}

    public function index(): JsonResponse
    {
        return response()->json(['success' => true, 'data' => Form::latest()->get()]);
    }

    public function store(StoreFormRequest $request): JsonResponse
    {
        $form = Form::create($request->validated());
        return response()->json(['success' => true, 'data' => $form], 201);
    }

    public function update(StoreFormRequest $request, Form $form): JsonResponse
    {
        abort_unless($form->tenant_id === app('current_tenant_id'), 403);
        $form->update($request->validated());
        return response()->json(['success' => true, 'data' => $form->fresh()]);
    }

    public function destroy(Form $form): JsonResponse
    {
        abort_unless($form->tenant_id === app('current_tenant_id'), 403);
        $form->delete();
        return response()->json(['success' => true, 'data' => null]);
    }

    // Public — no auth
    public function showPublic(string $slug): JsonResponse
    {
        $form = Form::withoutTenant()->where('slug', $slug)->where('active', true)->firstOrFail();
        return response()->json(['success' => true, 'data' => $form->only(['id', 'name', 'fields'])]);
    }

    // Public — no auth (rate limited in routes)
    public function submit(Request $request, string $slug): JsonResponse
    {
        $form = Form::withoutTenant()->where('slug', $slug)->where('active', true)->firstOrFail();

        // Honeypot check — bots fill hidden field
        if ($request->filled('_hp')) {
            return response()->json(['success' => true, 'data' => null]); // silent drop
        }

        // Only accept fields defined in the form schema
        $allowedKeys = collect($form->fields)->pluck('label')->map(fn($l) => \Illuminate\Support\Str::slug($l, '_'))->merge(['name','full_name','phone','email'])->unique()->toArray();
        $data = $request->only($allowedKeys);

        $submission = FormSubmission::create([
            'form_id'    => $form->id,
            'tenant_id'  => $form->tenant_id,
            'data'       => $data,
            'ip_address' => $request->ip(),
        ]);
        $lead = Lead::withoutGlobalScope('tenant')->create([
            'tenant_id'         => $form->tenant_id,
            'name'              => $data['name'] ?? ($data['full_name'] ?? 'ליד חדש'),
            'phone'             => $data['phone'] ?? null,
            'email'             => $data['email'] ?? null,
            'source'            => 'form:' . $slug,
            'pipeline_stage_id' => $form->destination_pipeline_id,
            'custom_fields'     => $data,
        ]);

        app()->instance('current_tenant_id', $form->tenant_id);
        $this->automation->fire('form_submitted', $lead);

        return response()->json(['success' => true, 'data' => null], 201);
    }
}
