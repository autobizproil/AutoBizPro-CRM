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
        return response()->json(['success' => true, 'data' => $contact->load('activities')]);
    }

    public function update(Request $request, Contact $contact): JsonResponse
    {
        $data = $request->validate([
            'name'          => 'sometimes|required|string|max:255',
            'phone'         => 'nullable|string|max:30',
            'email'         => 'nullable|email|max:255',
            'company'       => 'nullable|string|max:255',
            'tags'          => 'nullable|array',
            'custom_fields' => 'nullable|array',
        ]);

        $contact->update($data);
        return response()->json(['success' => true, 'data' => $contact->fresh()]);
    }

    public function destroy(Contact $contact): JsonResponse
    {
        $contact->delete();
        return response()->json(['success' => true, 'data' => null]);
    }
}
