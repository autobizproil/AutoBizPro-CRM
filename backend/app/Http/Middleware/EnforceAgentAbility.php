<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceAgentAbility
{
    // Applied to the whole authenticated API group so every module (leads,
    // contacts, automations, settings, ...) gets the same agent-token tiering,
    // not just leads. SPA sessions carry Sanctum's TransientToken, whose can()
    // always returns true, so human users are unaffected.
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && method_exists($user, 'tokenCan') && ! $user->tokenCan($this->requiredAbility($request))) {
            return response()->json(['success' => false, 'message' => 'Forbidden', 'code' => 403], 403);
        }

        return $next($request);
    }

    private function requiredAbility(Request $request): string
    {
        if (str_contains($request->path(), '/bulk')) {
            return 'crm:bulk';
        }

        return match ($request->method()) {
            'GET', 'HEAD'    => 'crm:read',
            'DELETE'         => 'crm:delete',
            default          => 'crm:write', // POST, PUT, PATCH
        };
    }
}
