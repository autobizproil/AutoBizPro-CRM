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
        $data = $request->validate([
            'name'   => 'sometimes|required|string|max:255',
            'role'   => 'sometimes|required|in:admin,manager,agent',
            'status' => 'sometimes|required|in:active,inactive',
        ]);

        $user->update($data);
        return response()->json(['success' => true, 'data' => $user->fresh()]);
    }

    public function destroy(User $user): JsonResponse
    {
        $user->update(['status' => 'inactive']);
        return response()->json(['success' => true, 'data' => null]);
    }
}
