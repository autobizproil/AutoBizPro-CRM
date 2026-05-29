<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class TenantMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $host      = $request->getHost();
        $subdomain = explode('.', $host)[0];

        // Dev: localhost has no subdomain — use X-Tenant header or fallback to 'demo'
        if ($subdomain === 'localhost' || $subdomain === '127') {
            $subdomain = $request->header('X-Tenant', 'demo');
        }

        $tenant = Tenant::where('subdomain', $subdomain)
            ->where('status', 'active')
            ->first();

        if (! $tenant) {
            return response()->json([
                'success' => false,
                'message' => 'Tenant not found',
                'code'    => 404,
            ], 404);
        }

        app()->instance('current_tenant_id', $tenant->id);
        app()->instance('current_tenant', $tenant);
        $request->attributes->set('tenant', $tenant);

        // Verify user belongs to this tenant BEFORE executing request (auth:sanctum runs first)
        if ($request->user() && $request->user()->tenant_id !== $tenant->id) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden',
                'code'    => 403,
            ], 403);
        }

        return $next($request);
    }
}
