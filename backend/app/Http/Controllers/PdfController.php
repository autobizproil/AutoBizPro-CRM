<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\Lead;
use App\Models\PdfSignatureToken;
use App\Models\Tenant;
use App\Services\PdfSignatureService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * PdfController
 *
 * Handles PDF generation and digital signature workflows.
 * Ported from Taskey taskey_lib/pdf_signature_v2/ and signature_form_to_pdf/.
 *
 * Public routes  : signatureForm, signatureSubmit, download
 * Protected routes: createToken, generateDocument
 */
class PdfController extends Controller
{
    public function __construct(private PdfSignatureService $pdfService) {}

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC — Signature form page
    // GET /api/pdf/sign/{tenant}/{token}
    // Ported from: webapi/sign_document_v2.php (page serving logic)
    // ─────────────────────────────────────────────────────────────────────────

    public function signatureForm(Request $request, string $tenant, string $token): Response|JsonResponse
    {
        $signToken = $this->resolveToken($tenant, $token);

        if (! $signToken) {
            return response()->json(['success' => false, 'message' => 'Token not found'], 404);
        }

        if (! $signToken->isValid()) {
            return response()->json(['success' => false, 'message' => 'Token expired or already used'], 422);
        }

        $lead = $signToken->lead;

        // Serve a simple HTML signature form — mirrors signature_form_to_pdf.php's do_signature_form_to_pdf()
        $html = $this->buildSignatureFormHtml($lead, $tenant, $token);

        return response($html, 200)->header('Content-Type', 'text/html; charset=utf-8');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC — Signature submit
    // POST /api/pdf/sign/{tenant}/{token}
    // Ported from: signature_form_to_pdf_ajax.php (form_pdf_details + pdf generation)
    // and sign_document_v2_ajax.php (pdf_sig_v2_save_signed_event)
    // ─────────────────────────────────────────────────────────────────────────

    public function signatureSubmit(Request $request, string $tenant, string $token): JsonResponse
    {
        $signToken = $this->resolveToken($tenant, $token);

        if (! $signToken) {
            return response()->json(['success' => false, 'message' => 'Token not found'], 404);
        }

        if (! $signToken->isValid()) {
            return response()->json(['success' => false, 'message' => 'Token expired or already used'], 422);
        }

        $signatureBase64 = $request->input('signature');

        if (empty($signatureBase64)) {
            return response()->json(['success' => false, 'message' => 'Signature is required'], 422);
        }

        $formData = $request->except(['signature', '_token']);

        $lead = $signToken->lead;

        // Generate the signed PDF — core logic in PdfSignatureService (ported from Taskey)
        $relativePath = $this->pdfService->generateSignaturePdf($lead, $signatureBase64, $formData);

        // Mark token as used (single-use — same as Taskey's status='signed')
        $signToken->used_at = now();
        $signToken->save();

        // Log activity on lead timeline — mirrors Taskey's leads_follow_log insert
        Activity::create([
            'tenant_id'   => $lead->tenant_id,
            'entity_type' => 'lead',
            'entity_id'   => $lead->id,
            'type'        => 'note',
            'body'        => 'Digital signature submitted. Document saved: ' . basename($relativePath),
            'user_id'     => null, // public action, no authenticated user
        ]);

        $downloadUrl = url("/api/pdf/download/{$tenant}/" . basename($relativePath));

        return response()->json([
            'success'      => true,
            'message'      => 'Signature submitted successfully',
            'download_url' => $downloadUrl,
            'filename'     => basename($relativePath),
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROTECTED — Generate document PDF from template
    // POST /api/pdf/generate/lead/{lead}
    // Ported from: template_builder_ajax.php logic (field-to-PDF rendering)
    // ─────────────────────────────────────────────────────────────────────────

    public function generateDocument(Request $request, Lead $lead): JsonResponse
    {
        abort_unless($lead->tenant_id === app('current_tenant_id'), 403);

        $request->validate([
            'template_html' => 'required|string|max:200000',
            'vars'          => 'sometimes|array',
        ]);

        $templateHtml = $request->input('template_html');
        $vars         = $request->input('vars', []);

        $relativePath = $this->pdfService->generateDocumentPdf($lead, $templateHtml, $vars);

        $tenantObj    = $lead->tenant ?? Tenant::find($lead->tenant_id);
        $subdomain    = $tenantObj ? $tenantObj->subdomain : (string) $lead->tenant_id;
        $downloadUrl  = url("/api/pdf/download/{$subdomain}/" . basename($relativePath));

        return response()->json([
            'success'      => true,
            'download_url' => $downloadUrl,
            'filename'     => basename($relativePath),
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PROTECTED — Create signing token for a lead
    // POST /api/pdf/token/lead/{lead}
    // Ported from: lead_signature_ajax.php (pdf_sig_v2_send_to_lead_event)
    // ─────────────────────────────────────────────────────────────────────────

    public function createToken(Request $request, Lead $lead): JsonResponse
    {
        abort_unless($lead->tenant_id === app('current_tenant_id'), 403);

        $tenantId = $lead->tenant_id;

        // Generate 64-character hex token — same as Taskey's bin2hex(random_bytes(32))
        $token     = bin2hex(random_bytes(32)); // 64 hex chars
        $expiresAt = now()->addHours(24);       // 24h single-use (spec requirement)

        $signToken = PdfSignatureToken::create([
            'tenant_id'  => $tenantId,
            'lead_id'    => $lead->id,
            'token'      => $token,
            'expires_at' => $expiresAt,
            'created_at' => now(),
        ]);

        // Resolve subdomain for URL — mirrors Taskey's signing_url construction
        $tenantObj = $lead->tenant ?? Tenant::find($tenantId);
        $subdomain = $tenantObj ? $tenantObj->subdomain : (string) $tenantId;

        $signingUrl = url("/api/pdf/sign/{$subdomain}/{$token}");

        return response()->json([
            'success'     => true,
            'token'       => $token,
            'expires_at'  => $expiresAt->toIso8601String(),
            'signing_url' => $signingUrl,
        ], 201);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC — Download a generated PDF
    // GET /api/pdf/download/{tenant}/{filename}
    // Security: validates filename to prevent path traversal (spec requirement)
    // ─────────────────────────────────────────────────────────────────────────

    public function download(Request $request, string $tenant, string $filename): Response|JsonResponse
    {
        // Security: reject path traversal — same guard as Taskey's upload dir validation
        if (
            str_contains($filename, '..') ||
            str_contains($filename, '/') ||
            str_contains($filename, '\\') ||
            str_starts_with($filename, '/') ||
            preg_match('#[^a-zA-Z0-9_\-\.]#', $filename)
        ) {
            return response()->json(['success' => false, 'message' => 'Invalid filename'], 422);
        }

        // Resolve tenant to find the correct subdirectory
        $tenantObj = Tenant::where('subdomain', $tenant)->first();
        if (! $tenantObj) {
            return response()->json(['success' => false, 'message' => 'Tenant not found'], 404);
        }

        $relativePath = 'pdfs/' . $tenantObj->id . '/' . $filename;

        if (! Storage::disk('local')->exists($relativePath)) {
            return response()->json(['success' => false, 'message' => 'File not found'], 404);
        }

        $content = Storage::disk('local')->get($relativePath);

        // Validate PDF magic bytes — same check as Taskey's sign_document_v2_ajax.php
        if (substr($content, 0, 5) !== '%PDF-') {
            return response()->json(['success' => false, 'message' => 'Invalid file'], 422);
        }

        return response($content, 200, [
            'Content-Type'        => 'application/pdf',
            'Content-Disposition' => 'inline; filename="' . $filename . '"',
            'Content-Length'      => strlen($content),
            // Never expose server paths — only the safe filename
            'X-Filename'          => $filename,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Resolve a PdfSignatureToken by tenant subdomain + token string.
     * Mirrors Taskey's sql_lead query in sign_document_v2_ajax.php.
     */
    private function resolveToken(string $tenantSubdomain, string $token): ?PdfSignatureToken
    {
        $tenantObj = Tenant::where('subdomain', $tenantSubdomain)->first();
        if (! $tenantObj) {
            return null;
        }

        return PdfSignatureToken::where('tenant_id', $tenantObj->id)
            ->where('token', $token)
            ->with('lead')
            ->first();
    }

    /**
     * Build the public HTML signature form.
     *
     * Ported from: signature_form_to_pdf.php (do_signature_form_to_pdf)
     * Canvas signature pad with same mousedown/mousemove/mouseup logic.
     * Submits via fetch to POST /api/pdf/sign/{tenant}/{token}.
     */
    private function buildSignatureFormHtml(Lead $lead, string $tenant, string $token): string
    {
        $name  = htmlspecialchars($lead->name ?? '', ENT_QUOTES, 'UTF-8');
        $email = htmlspecialchars($lead->email ?? '', ENT_QUOTES, 'UTF-8');
        $phone = htmlspecialchars($lead->phone ?? '', ENT_QUOTES, 'UTF-8');
        $date  = date('Y-m-d');

        $submitUrl = '/api/pdf/sign/' . rawurlencode($tenant) . '/' . rawurlencode($token);

        return <<<HTML
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Digital Signature Form</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; direction: rtl; }
        .form-group { margin-bottom: 16px; }
        label { display: block; font-weight: bold; margin-bottom: 4px; }
        input[type=text], input[type=email] { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        #signatureCanvas { border: 2px solid #333; display: block; background: #fff; cursor: crosshair; touch-action: none; }
        .btn { padding: 10px 24px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 15px; }
        .btn-clear { background: #6b7280; margin-left: 10px; }
        #successMsg { display: none; color: green; font-size: 18px; margin-top: 20px; }
        #errorMsg { display: none; color: red; margin-top: 10px; }
    </style>
</head>
<body>
    <h2>טופס חתימה דיגיטלית</h2>

    <form id="signatureForm">
        <div class="form-group">
            <label for="field_name">שם מלא</label>
            <input type="text" id="field_name" name="name" value="{$name}" required>
        </div>
        <div class="form-group">
            <label for="field_email">אימייל</label>
            <input type="text" id="field_email" name="email" value="{$email}">
        </div>
        <div class="form-group">
            <label for="field_phone">טלפון</label>
            <input type="text" id="field_phone" name="phone" value="{$phone}">
        </div>
        <div class="form-group">
            <label for="field_date">תאריך</label>
            <input type="text" id="field_date" name="date" value="{$date}" readonly>
        </div>
        <div class="form-group">
            <label>חתימה</label>
            <canvas id="signatureCanvas" width="400" height="150"></canvas>
            <div style="margin-top:8px;">
                <button type="submit" class="btn">שלח חתימה</button>
                <button type="button" class="btn btn-clear" onclick="clearCanvas()">נקה</button>
            </div>
        </div>
        <div id="errorMsg"></div>
    </form>

    <div id="successMsg">
        <p>✓ החתימה התקבלה בהצלחה! תוכל/י לסגור את הדף.</p>
        <a id="downloadLink" href="#" target="_blank">הורד את המסמך</a>
    </div>

    <script>
    // Canvas signature pad — ported 1:1 from signature_form_to_pdf.php
    var canvas = document.getElementById('signatureCanvas');
    var ctx = canvas.getContext('2d');
    var drawing = false;

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'black';

    function getPos(e) {
        var rect = canvas.getBoundingClientRect();
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    canvas.addEventListener('mousedown', function(e) {
        drawing = true;
        var p = getPos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
    });

    canvas.addEventListener('mousemove', function(e) {
        if (!drawing) return;
        var p = getPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
    });

    canvas.addEventListener('mouseup', function() { drawing = false; });
    canvas.addEventListener('mouseout', function() { drawing = false; });

    // Touch support
    canvas.addEventListener('touchstart', function(e) { e.preventDefault(); drawing = true; var p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('touchmove',  function(e) { e.preventDefault(); if (!drawing) return; var p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    canvas.addEventListener('touchend',   function()  { drawing = false; });

    function clearCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    document.getElementById('signatureForm').addEventListener('submit', function(e) {
        e.preventDefault();

        var signatureData = canvas.toDataURL('image/png');
        var errEl = document.getElementById('errorMsg');
        errEl.style.display = 'none';

        var formData = new FormData(this);
        formData.append('signature', signatureData);

        fetch('{$submitUrl}', {
            method: 'POST',
            body: formData
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                document.getElementById('signatureForm').style.display = 'none';
                var successEl = document.getElementById('successMsg');
                successEl.style.display = 'block';
                if (data.download_url) {
                    document.getElementById('downloadLink').href = data.download_url;
                }
            } else {
                errEl.style.display = 'block';
                errEl.textContent = data.message || 'שגיאה בשליחת הטופס';
            }
        })
        .catch(function() {
            errEl.style.display = 'block';
            errEl.textContent = 'שגיאת רשת. נסה שנית.';
        });
    });
    </script>
</body>
</html>
HTML;
    }
}
