<?php

use App\Http\Middleware\CheckPermission;
use App\Http\Middleware\TenantMiddleware;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Support\Arr;

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
            $errors = $e->errors();
            // Surface the first field-specific message (e.g. a custom unique-email
            // message) instead of always the generic string — frontends across the
            // app pick `message` before falling back to `errors`, so a fixed generic
            // string here silently masked every field-specific validation message.
            $message = ! empty($errors) ? Arr::first(Arr::flatten($errors)) : 'שגיאת ולידציה';

            return response()->json([
                'success' => false,
                'message' => $message,
                'errors'  => $errors,
                'code'    => 422,
            ], 422);
        });

        $exceptions->render(function (\Illuminate\Database\Eloquent\ModelNotFoundException $e, $request) {
            return response()->json(['success' => false, 'message' => 'לא נמצא', 'code' => 404], 404);
        });
    })->create();
