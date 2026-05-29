<?php

namespace App\Http\Controllers;

use App\Models\RolePermission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public function getTenant(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'data' => app('current_tenant')]);
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
        return response()->json(['success' => true, 'data' => app('current_tenant')->fresh()]);
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

    public function updatePermissions(Request $request): JsonResponse
    {
        // Permission management is admin-only — prevents privilege escalation
        abort_unless($request->user()->role === 'admin', 403);

        $data = $request->validate([
            'permissions'           => 'required|array',
            'permissions.*.role'    => 'required|in:admin,manager,agent',
            'permissions.*.module'  => 'required|string',
            'permissions.*.can_create' => 'boolean',
            'permissions.*.can_read'   => 'boolean',
            'permissions.*.can_update' => 'boolean',
            'permissions.*.can_delete' => 'boolean',
        ]);

        foreach ($data['permissions'] as $perm) {
            RolePermission::updateOrCreate(
                ['tenant_id' => app('current_tenant_id'), 'role' => $perm['role'], 'module' => $perm['module']],
                $perm
            );
        }

        return response()->json(['success' => true, 'data' => null]);
    }
}
