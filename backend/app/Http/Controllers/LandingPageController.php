<?php

namespace App\Http\Controllers;

use App\Models\Lead;
use App\Models\LandingPage;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LandingPageController extends Controller
{
    // ─────────────────────────────────────────────────────────────────────────
    // PROTECTED — List all landing pages for the authenticated tenant
    // GET /api/landing-pages
    // ─────────────────────────────────────────────────────────────────────────

    public function index(): JsonResponse
    {
        $pages = LandingPage::select('id', 'title', 'slug', 'status', 'views', 'created_at')
            ->latest()
            ->get();

        return response()->json(['success' => true, 'data' => $pages]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROTECTED — Create a new landing page
    // POST /api/landing-pages
    // ─────────────────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $tenantId = app('current_tenant_id');

        $data = $request->validate([
            'title'    => 'required|string|max:200',
            'slug'     => [
                'required',
                'string',
                'regex:/^[a-z0-9-]+$/',
                'max:100',
                Rule::unique('landing_pages')->where('tenant_id', $tenantId),
            ],
            'blocks'   => 'required|array',
            'settings' => 'nullable|array',
            'status'   => 'sometimes|in:draft,published',
        ]);

        $page = LandingPage::create($data);

        return response()->json(['success' => true, 'data' => $page], 201);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROTECTED — Show a single landing page
    // GET /api/landing-pages/{landing_page}
    // ─────────────────────────────────────────────────────────────────────────

    public function show(LandingPage $landingPage): JsonResponse
    {
        $this->authorizeOwnership($landingPage);

        return response()->json(['success' => true, 'data' => $landingPage]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROTECTED — Update a landing page
    // PUT /api/landing-pages/{landing_page}
    // ─────────────────────────────────────────────────────────────────────────

    public function update(Request $request, LandingPage $landingPage): JsonResponse
    {
        $this->authorizeOwnership($landingPage);

        $tenantId = app('current_tenant_id');

        $data = $request->validate([
            'title'    => 'required|string|max:200',
            'slug'     => [
                'required',
                'string',
                'regex:/^[a-z0-9-]+$/',
                'max:100',
                Rule::unique('landing_pages')
                    ->where('tenant_id', $tenantId)
                    ->ignore($landingPage->id),
            ],
            'blocks'   => 'required|array',
            'settings' => 'nullable|array',
            'status'   => 'sometimes|in:draft,published',
        ]);

        $landingPage->update($data);

        return response()->json(['success' => true, 'data' => $landingPage->fresh()]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROTECTED — Delete a landing page
    // DELETE /api/landing-pages/{landing_page}
    // ─────────────────────────────────────────────────────────────────────────

    public function destroy(LandingPage $landingPage): JsonResponse
    {
        $this->authorizeOwnership($landingPage);

        $landingPage->delete();

        return response()->json(['success' => true, 'data' => null]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC — Render a published landing page
    // GET /api/lp/{tenant}/{slug}
    // ─────────────────────────────────────────────────────────────────────────

    public function render(Request $request, string $tenant, string $slug): JsonResponse
    {
        $tenantModel = Tenant::where('subdomain', $tenant)->first();

        if (! $tenantModel) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        $page = LandingPage::withoutTenant()
            ->where('tenant_id', $tenantModel->id)
            ->where('slug', $slug)
            ->where('status', 'published')
            ->first();

        if (! $page) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        // Increment view counter
        $page->increment('views');

        return response()->json(['success' => true, 'data' => ['page' => $page->fresh()]]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC — Submit the landing page lead capture form
    // POST /api/lp/{tenant}/{slug}/submit
    // ─────────────────────────────────────────────────────────────────────────

    public function submitForm(Request $request, string $tenant, string $slug): JsonResponse
    {
        $tenantModel = Tenant::where('subdomain', $tenant)->first();

        if (! $tenantModel) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        $page = LandingPage::withoutTenant()
            ->where('tenant_id', $tenantModel->id)
            ->where('slug', $slug)
            ->where('status', 'published')
            ->first();

        if (! $page) {
            return response()->json(['success' => false, 'message' => 'Not found'], 404);
        }

        $data = $request->validate([
            'name'    => 'sometimes|nullable|string|max:200',
            'phone'   => 'sometimes|nullable|string|max:50',
            'email'   => 'sometimes|nullable|email|max:200',
            'message' => 'sometimes|nullable|string|max:2000',
        ]);

        // At least one field must be present and non-empty
        $filled = collect($data)->filter(fn ($v) => ! is_null($v) && $v !== '')->count();
        if ($filled === 0) {
            return response()->json([
                'success' => false,
                'message' => 'At least one field (name, phone, email, or message) is required.',
            ], 422);
        }

        // Create lead — bypass tenant scope since this is a public action
        Lead::withoutGlobalScope('tenant')->create([
            'tenant_id' => $tenantModel->id,
            'name'      => $data['name'] ?? ($data['email'] ?? 'ליד חדש'),
            'phone'     => $data['phone'] ?? null,
            'email'     => $data['email'] ?? null,
            'source'    => $page->title,
            'notes'     => $data['message'] ?? null,
        ]);

        return response()->json(['success' => true]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    private function authorizeOwnership(LandingPage $page): void
    {
        if (app()->has('current_tenant_id') && $page->tenant_id !== app('current_tenant_id')) {
            abort(403, 'Forbidden');
        }
    }
}
