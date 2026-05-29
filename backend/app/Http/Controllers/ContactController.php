<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreContactRequest;
use App\Models\Contact;
use App\Services\AutomationEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContactController extends Controller
{
    public function __construct(private AutomationEngine $automation) {}

    public function index(Request $request): JsonResponse
    {
        $query = Contact::query();

        if ($s = $request->search) {
            $query->where(fn ($q) => $q->where('name', 'like', "%$s%")
                ->orWhere('email', 'like', "%$s%")
                ->orWhere('phone', 'like', "%$s%")
                ->orWhere('company', 'like', "%$s%"));
        }

        return response()->json(['success' => true, 'data' => $query->latest()->paginate(25)]);
    }

    public function store(StoreContactRequest $request): JsonResponse
    {
        $contact = Contact::create($request->validated());
        $this->automation->fire('contact_created', $contact);
        return response()->json(['success' => true, 'data' => $contact], 201);
    }

    public function show(Contact $contact): JsonResponse
    {
        abort_unless($contact->tenant_id === app('current_tenant_id'), 403);
        return response()->json(['success' => true, 'data' => $contact->load('activities')]);
    }

    public function update(Request $request, Contact $contact): JsonResponse
    {
        abort_unless($contact->tenant_id === app('current_tenant_id'), 403);

        $data = $request->validate([
            'name'          => 'sometimes|required|string|max:255',
            'phone'         => 'nullable|string|max:30',
            'email'         => 'nullable|email|max:255',
            'company'       => 'nullable|string|max:255',
            'role'          => 'nullable|string|max:100',
            'notes'         => 'nullable|string',
            'tags'          => 'nullable|array',
            'custom_fields' => 'nullable|array',
        ]);

        $contact->update($data);
        return response()->json(['success' => true, 'data' => $contact->fresh()]);
    }

    public function destroy(Contact $contact): JsonResponse
    {
        abort_unless($contact->tenant_id === app('current_tenant_id'), 403);
        $contact->delete();
        return response()->json(['success' => true, 'data' => null]);
    }
}
