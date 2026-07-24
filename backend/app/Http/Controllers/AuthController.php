<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
        ], [
            'email.required'    => 'כתובת אימייל היא שדה חובה',
            'email.email'       => 'כתובת אימייל לא תקינה',
            'password.required' => 'סיסמה היא שדה חובה',
        ]);

        if (! Auth::attempt($credentials, true)) {
            return response()->json([
                'success' => false,
                'message' => 'אימייל או סיסמה שגויים',
                'code'    => 401,
            ], 401);
        }

        $user = Auth::user();

        // Service users exist only to hold agent API tokens — interactive login is never valid
        if ($user->is_service) {
            Auth::guard('web')->logout();
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return response()->json([
                'success' => false,
                'message' => 'Forbidden',
                'code'    => 403,
            ], 403);
        }

        if ($user->status === 'inactive') {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'success' => false,
                'message' => 'המשתמש אינו פעיל',
                'code'    => 403,
            ], 403);
        }

        // Sanctum SPA — cookie is set automatically, return user + permissions
        return response()->json([
            'success' => true,
            'data'    => [
                'user'        => $user,
                'permissions' => $this->getPermissions($user),
            ],
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['success' => true, 'data' => null]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'user'        => $user,
                'permissions' => $this->getPermissions($user),
            ],
        ]);
    }

    private function getPermissions($user): array
    {
        $modules = ['leads', 'contacts', 'automations', 'forms', 'users', 'reports'];
        $actions = ['can_create', 'can_read', 'can_update', 'can_delete'];
        $perms   = [];

        foreach ($modules as $module) {
            foreach ($actions as $action) {
                $perms[$module][$action] = \App\Models\RolePermission::defaultFor($user->role, $module, $action);
            }
        }

        return $perms;
    }
}
