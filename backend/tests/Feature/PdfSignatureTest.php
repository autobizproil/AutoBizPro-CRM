<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\Lead;
use App\Models\PdfSignatureToken;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PdfSignatureTest extends TestCase
{
    use RefreshDatabase;

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private function makeTenantAndAdmin(): array
    {
        $tenant = Tenant::create([
            'name'      => 'PDF Test Tenant',
            'subdomain' => 'pdftest',
            'status'    => 'active',
        ]);

        app()->instance('current_tenant_id', $tenant->id);

        $admin = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Admin',
            'email'     => 'admin@pdftest.test',
            'password'  => Hash::make('password'),
            'role'      => 'admin',
        ]);

        $lead = Lead::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Test Lead',
            'phone'     => '050-1234567',
            'email'     => 'lead@example.com',
            'status'    => 'new',
        ]);

        return [$tenant, $admin, $lead];
    }

    /**
     * Return a minimal valid 1x1 PNG in base64 format.
     * Same approach as Taskey's canvas.toDataURL() — small but real PNG.
     */
    private function fakePngBase64(): string
    {
        // 1x1 transparent PNG — base64 encoded
        $png = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        );
        return 'data:image/png;base64,' . base64_encode($png);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: Token creation returns URL
    // Mirrors Taskey's pdf_sig_v2_send_to_lead_event returning signing_url
    // ─────────────────────────────────────────────────────────────────────────

    public function test_create_token_returns_signing_url(): void
    {
        [$tenant, $admin, $lead] = $this->makeTenantAndAdmin();

        $response = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'pdftest'])
            ->postJson("/api/pdf/token/lead/{$lead->id}");

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['success', 'token', 'expires_at', 'signing_url']);

        $this->assertStringContainsString('/api/pdf/sign/pdftest/', $response->json('signing_url'));
        $this->assertDatabaseHas('pdf_signature_tokens', [
            'tenant_id' => $tenant->id,
            'lead_id'   => $lead->id,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: Signature form served for valid token
    // ─────────────────────────────────────────────────────────────────────────

    public function test_signature_form_served_for_valid_token(): void
    {
        [$tenant, $admin, $lead] = $this->makeTenantAndAdmin();

        $token = PdfSignatureToken::create([
            'tenant_id'  => $tenant->id,
            'lead_id'    => $lead->id,
            'token'      => bin2hex(random_bytes(32)),
            'expires_at' => now()->addHours(24),
            'created_at' => now(),
        ]);

        $response = $this->get("/api/pdf/sign/pdftest/{$token->token}");

        $response->assertOk();
        $this->assertStringContainsString('text/html', $response->headers->get('Content-Type'));
        $this->assertStringContainsString('signatureCanvas', $response->getContent());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: Expired token returns 422
    // Mirrors Taskey's token_expires_at < time() check
    // ─────────────────────────────────────────────────────────────────────────

    public function test_expired_token_returns_422(): void
    {
        [$tenant, $admin, $lead] = $this->makeTenantAndAdmin();

        $token = PdfSignatureToken::create([
            'tenant_id'  => $tenant->id,
            'lead_id'    => $lead->id,
            'token'      => bin2hex(random_bytes(32)),
            'expires_at' => now()->subHour(), // already expired
            'created_at' => now(),
        ]);

        $response = $this->get("/api/pdf/sign/pdftest/{$token->token}");

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: Unknown token returns 404
    // ─────────────────────────────────────────────────────────────────────────

    public function test_unknown_token_returns_404(): void
    {
        Tenant::create(['name' => 'T404', 'subdomain' => 'pdftest', 'status' => 'active']);
        app()->instance('current_tenant_id', 1);

        $response = $this->get('/api/pdf/sign/pdftest/nonexistent0000000000000000000000000000000000000000000000000000000');
        $response->assertStatus(404);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: Signature submit generates PDF and logs Activity
    // Mirrors Taskey's: save PNG -> generate PDF -> log leads_follow_log
    // ─────────────────────────────────────────────────────────────────────────

    public function test_signature_submit_generates_pdf_and_logs_activity(): void
    {
        Storage::fake('local');

        [$tenant, $admin, $lead] = $this->makeTenantAndAdmin();

        $tokenStr = bin2hex(random_bytes(32));
        PdfSignatureToken::create([
            'tenant_id'  => $tenant->id,
            'lead_id'    => $lead->id,
            'token'      => $tokenStr,
            'expires_at' => now()->addHours(24),
            'created_at' => now(),
        ]);

        $response = $this->post("/api/pdf/sign/pdftest/{$tokenStr}", [
            'signature' => $this->fakePngBase64(),
            'name'      => 'Test Lead',
            'date'      => date('Y-m-d'),
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['success', 'message', 'download_url', 'filename']);

        // PDF file must exist in storage
        $filename = $response->json('filename');
        Storage::disk('local')->assertExists("pdfs/{$tenant->id}/{$filename}");

        // Token must be marked as used (single-use — Taskey: status='signed')
        $this->assertNotNull(
            PdfSignatureToken::where('token', $tokenStr)->first()->used_at
        );

        // Activity logged on lead timeline (mirrors Taskey's leads_follow_log)
        $this->assertDatabaseHas('activities', [
            'tenant_id'   => $tenant->id,
            'entity_type' => 'lead',
            'entity_id'   => $lead->id,
            'type'        => 'note',
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: Token is single-use — second submit returns 422
    // ─────────────────────────────────────────────────────────────────────────

    public function test_used_token_returns_422_on_second_submit(): void
    {
        Storage::fake('local');

        [$tenant, $admin, $lead] = $this->makeTenantAndAdmin();

        $tokenStr = bin2hex(random_bytes(32));
        PdfSignatureToken::create([
            'tenant_id'  => $tenant->id,
            'lead_id'    => $lead->id,
            'token'      => $tokenStr,
            'expires_at' => now()->addHours(24),
            'used_at'    => now(), // already used
            'created_at' => now(),
        ]);

        $response = $this->postJson("/api/pdf/sign/pdftest/{$tokenStr}", [
            'signature' => $this->fakePngBase64(),
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: Download served correctly with application/pdf headers
    // Mirrors Taskey's signed_pdfs serving
    // ─────────────────────────────────────────────────────────────────────────

    public function test_download_serves_pdf_with_correct_headers(): void
    {
        Storage::fake('local');

        $tenant = Tenant::create(['name' => 'DL Tenant', 'subdomain' => 'pdftest', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        // Put a fake PDF in storage (with valid PDF magic bytes)
        $fakePdf  = '%PDF-1.4 fake content';
        $filename = 'test-' . time() . '.pdf';
        Storage::disk('local')->put("pdfs/{$tenant->id}/{$filename}", $fakePdf);

        $response = $this->get("/api/pdf/download/pdftest/{$filename}");

        $response->assertOk();
        $this->assertStringContainsString('application/pdf', $response->headers->get('Content-Type'));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: Download rejects path traversal filenames
    // Security requirement from spec
    // ─────────────────────────────────────────────────────────────────────────

    public function test_download_rejects_path_traversal(): void
    {
        Tenant::create(['name' => 'Sec', 'subdomain' => 'pdftest', 'status' => 'active']);
        app()->instance('current_tenant_id', 1);

        $traversalAttempts = [
            '../etc/passwd',
            '..%2Fetc%2Fpasswd',
            '/etc/passwd',
            '....//etc/passwd',
        ];

        foreach ($traversalAttempts as $attempt) {
            $response = $this->get('/api/pdf/download/pdftest/' . $attempt);
            $this->assertContains(
                $response->getStatusCode(),
                [404, 422],
                "Expected 404 or 422 for traversal attempt: {$attempt}"
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: Generate document PDF (protected endpoint)
    // ─────────────────────────────────────────────────────────────────────────

    public function test_generate_document_returns_download_url(): void
    {
        Storage::fake('local');

        [$tenant, $admin, $lead] = $this->makeTenantAndAdmin();

        $response = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'pdftest'])
            ->postJson("/api/pdf/generate/lead/{$lead->id}", [
                'template_html' => '<h1>Hello {name}</h1><p>Phone: {phone}</p>',
                'vars'          => ['custom_field' => 'value'],
            ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['success', 'download_url', 'filename']);

        $filename = $response->json('filename');
        Storage::disk('local')->assertExists("pdfs/{$tenant->id}/{$filename}");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: Create token requires auth
    // ─────────────────────────────────────────────────────────────────────────

    public function test_create_token_requires_auth(): void
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => 'pdftest', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        $lead = Lead::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Lead',
            'phone'     => '050-000000',
            'status'    => 'new',
        ]);

        $response = $this->postJson("/api/pdf/token/lead/{$lead->id}");
        $response->assertUnauthorized();
    }
}
