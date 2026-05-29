<?php

namespace App\Http\Middleware;

use App\Models\RolePermission;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPermission
{
    public function handle(Request $request, Closure $next, string $module, string $action): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated', 'code' => 401], 401);
        }

        if ($this->hasPermission($user, $module, $action)) {
            return $next($request);
        }

        return response()->json(['success' => false, 'message' => 'Forbidden', 'code' => 403], 403);
    }

    private function hasPermission($user, string $module, string $action): bool
    {
        // Cache per-request to avoid N+1 on routes with multiple permission checks
        $cacheKey = "perm_{$user->tenant_id}_{$user->role}";
        $overrides = \Illuminate\Support\Facades\Cache::store('array')->rememberForever(
            $cacheKey,
            fn () => RolePermission::where('role', $user->role)->get()->keyBy('module')
        );

        if ($overrides->has($module)) {
            return (bool) $overrides->get($module)->{$action};
        }

        return RolePermission::defaultFor($user->role, $module, $action);
    }
}
