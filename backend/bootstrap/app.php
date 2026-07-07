<?php

use App\Http\Middleware\CheckPermission;
use App\Http\Middleware\TenantMiddleware;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__ . '/../routes/api.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->statefulApi(); // Sanctum SPA mode

        $middleware->alias([
            'tenant'        => TenantMiddleware::class,
            'permission'    => CheckPermission::class,
            'abilities'     => \Laravel\Sanctum\Http\Middleware\CheckAbilities::class,
            'agent.ability' => \App\Http\Middleware\EnforceAgentAbility::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, $request) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated', 'code' => 401], 401);
        });

        $exceptions->render(function (\Illuminate\Validation\ValidationException $e, $request) {
            return response()->json([
                'success' => false,
                'message' => 'שגיאת ולידציה',
                'errors'  => $e->errors(),
                'code'    => 422,
            ], 422);
        });

        $exceptions->render(function (\Illuminate\Database\Eloquent\ModelNotFoundException $e, $request) {
            return response()->json(['success' => false, 'message' => 'לא נמצא', 'code' => 404], 404);
        });
    })->create();
