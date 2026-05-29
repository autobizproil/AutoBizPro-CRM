<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreUserRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['success' => true, 'data' => User::latest()->get()]);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $user = User::create($request->validated());
        return response()->json(['success' => true, 'data' => $user], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        // Tenant isolation — never touch a user from another tenant
        abort_unless($user->tenant_id === $request->user()->tenant_id, 403);

        $data = $request->validate([
            'name'   => 'sometimes|required|string|max:255',
            'role'   => 'sometimes|required|in:admin,manager,agent',
            'status' => 'sometimes|required|in:active,inactive',
        ]);

        // Only admins may change roles, and nobody may change their own role
        if ($request->has('role')) {
            abort_unless($request->user()->role === 'admin', 403);
            abort_if($user->id === $request->user()->id, 403, 'אי אפשר לשנות את התפקיד של עצמך');
        }

        $user->update($data);
        return response()->json(['success' => true, 'data' => $user->fresh()]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        abort_unless($user->tenant_id === $request->user()->tenant_id, 403);
        abort_if($user->id === $request->user()->id, 403, 'אי אפשר להשבית את עצמך');

        $user->update(['status' => 'inactive']);
        return response()->json(['success' => true, 'data' => null]);
    }
}
