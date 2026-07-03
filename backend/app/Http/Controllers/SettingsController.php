<?php

namespace App\Http\Controllers;

use App\Models\RolePermission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SettingsController extends Controller
{
    public function getTenant(Request $request): JsonResponse
    {
        $tenant = app('current_tenant')->toArray();

        if ($request->user()->role !== 'admin') {
            unset($tenant['settings']['whatsapp_api_key']);
        }

        return response()->json(['success' => true, 'data' => $tenant]);
    }

    public function updateTenant(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'     => 'sometimes|required|string|max:255',
            'settings' => 'nullable|array',
            'settings.whatsapp_provider' => 'nullable|in:360dialog,ultramsg,twilio,smartsend',
            'settings.whatsapp_api_key'  => 'nullable|string',
        ]);

        app('current_tenant')->update($data);
        $tenant = app('current_tenant')->fresh()->toArray();

        if ($request->user()->role !== 'admin') {
            unset($tenant['settings']['whatsapp_api_key']);
        }

        return response()->json(['success' => true, 'data' => $tenant]);
    }

    public function getLabels(): JsonResponse
    {
        $svc = app(\App\Services\SettingsService::class);
        return response()->json(['success' => true, 'data' => $svc->labels()]);
    }

    public function updateLabels(Request $request): JsonResponse
    {
        $data = $request->validate(['labels' => 'required|array']);
        $svc = app(\App\Services\SettingsService::class);
        $svc->set('labels', $data['labels']);
        return response()->json(['success' => true, 'data' => $svc->labels()]);
    }

    public function getPermissions(): JsonResponse
    {
        $permissions = RolePermission::all()->groupBy('role');
        return response()->json(['success' => true, 'data' => $permissions]);
    }

    private const EDITABLE_MODULES = ['leads', 'contacts', 'automations', 'forms', 'users', 'reports'];
    private const ROLE_RANK = ['agent' => 1, 'manager' => 2, 'admin' => 3];

    public function updatePermissions(Request $request): JsonResponse
    {
        // Permission management is admin-only — prevents privilege escalation
        abort_unless($request->user()->role === 'admin', 403);

        $data = $request->validate([
            'permissions'           => 'required|array',
            'permissions.*.role'    => 'required|in:admin,manager,agent',
            'permissions.*.module'  => ['required', 'string', Rule::in(self::EDITABLE_MODULES)],
            'permissions.*.can_create' => 'boolean',
            'permissions.*.can_read'   => 'boolean',
            'permissions.*.can_update' => 'boolean',
            'permissions.*.can_delete' => 'boolean',
        ]);

        $actingRank = self::ROLE_RANK[$request->user()->role] ?? 0;

        foreach ($data['permissions'] as $perm) {
            if ((self::ROLE_RANK[$perm['role']] ?? 0) > $actingRank) {
                return response()->json([
                    'success' => false,
                    'message' => 'אינך רשאי להעניק הרשאות לתפקיד גבוה מהתפקיד שלך',
                    'code'    => 403,
                ], 403);
            }

            RolePermission::updateOrCreate(
                ['tenant_id' => app('current_tenant_id'), 'role' => $perm['role'], 'module' => $perm['module']],
                $perm
            );
        }

        return response()->json(['success' => true, 'data' => null]);
    }
}
