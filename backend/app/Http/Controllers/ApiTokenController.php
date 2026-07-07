<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreApiTokenRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class ApiTokenController extends Controller
{
    private const SERVICE_EMAIL = 'agent-bot@service.internal';

    public function index(): JsonResponse
    {
        $service = $this->serviceUser(false);

        $tokens = $service
            ? $service->tokens()->get(['id', 'name', 'abilities', 'last_used_at', 'created_at'])
            : collect();

        return response()->json(['success' => true, 'data' => $tokens]);
    }

    public function store(StoreApiTokenRequest $request): JsonResponse
    {
        $service = $this->serviceUser(true);

        $token = $service->createToken($request->input('name'), $request->input('abilities'));

        return response()->json([
            'success' => true,
            'data'    => [
                // Plain-text token shown exactly once — it is not retrievable later
                'token'     => $token->plainTextToken,
                'name'      => $request->input('name'),
                'abilities' => $request->input('abilities'),
            ],
        ], 201);
    }

    public function destroy(Request $request, int $tokenId): JsonResponse
    {
        $service = $this->serviceUser(false);

        $deleted = $service ? $service->tokens()->where('id', $tokenId)->delete() : 0;

        if (! $deleted) {
            return response()->json(['success' => false, 'message' => 'Token not found', 'code' => 404], 404);
        }

        return response()->json(['success' => true, 'data' => null]);
    }

    // All agent tokens hang off one per-tenant service user so activity logs
    // attribute automation actions to the bot, never to the requesting admin.
    private function serviceUser(bool $createIfMissing): ?User
    {
        $tenantId = app('current_tenant_id');

        $existing = User::where('tenant_id', $tenantId)->where('is_service', true)->first();
        if ($existing || ! $createIfMissing) {
            return $existing;
        }

        return User::create([
            'tenant_id'  => $tenantId,
            'name'       => 'Automation Agent',
            'email'      => self::SERVICE_EMAIL,
            'password'   => Hash::make(Str::random(64)),
            'role'       => 'admin',
            'status'     => 'active',
            'is_service' => true,
        ]);
    }
}
