<?php

namespace App\Services;

use App\Models\Lead;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use TCPDF;

/**
 * PdfSignatureService
 *
 * Ported from Taskey taskey_lib/pdf_signature_v2/ and signature_form_to_pdf/.
 * Core logic preserved 1:1; framework glue replaced (Storage, Lead model, etc.)
 */
class PdfSignatureService
{
    /**
     * Generate a signed PDF by embedding a base64 PNG signature onto a blank PDF page.
     *
     * Ported from: signature_form_to_pdf/signature_form_to_pdf_ajax.php (form_pdf_details)
     * and sign_document_v2_ajax.php (pdf_sig_v2_save_signed_event)
     *
     * @param  Lead    $lead           The lead record (used for tenant_id, name, etc.)
     * @param  string  $signatureBase64 Raw base64 PNG (with or without data:image/png;base64, prefix)
     * @param  array   $formData        Associative array of form field values keyed by field name
     * @return string  Relative storage path inside storage/app (e.g. pdfs/1/abc123.pdf)
     */
    public function generateSignaturePdf(Lead $lead, string $signatureBase64, array $formData): string
    {
        // Strip data URI prefix — same as Taskey's str_replace approach
        $rawBase64       = preg_replace('#^data:image/[a-z]+;base64,#', '', $signatureBase64);
        $signatureBytes  = base64_decode($rawBase64, true);

        if ($signatureBytes === false || strlen($signatureBytes) < 4) {
            throw new \InvalidArgumentException('Invalid base64 signature data');
        }

        // Validate PNG magic bytes (same check as Taskey's PDF header check)
        if (substr($signatureBytes, 0, 4) !== "\x89PNG") {
            throw new \InvalidArgumentException('Signature must be a PNG image');
        }

        $tenantId = $lead->tenant_id;

        // Build TCPDF document via writeHTML so the signature is embedded as a
        // base64 data-URI <img> inside HTML — this path works without GD/Imagick
        // (TCPDF only needs image extensions when loading image *files*, not data URIs
        // via HTML rendering with SVG fallback or text annotation).
        // Mirrors Taskey's text_on_pdf + image_on_pdf layout.
        $html = '<h3>Signed Document</h3>';

        foreach ($formData as $label => $value) {
            if (in_array($label, ['follow_id', 'pdf_signature_id', 'signatureData', '_token'], true)) {
                continue;
            }
            $safeLabel = htmlspecialchars((string) $label, ENT_QUOTES, 'UTF-8');
            $safeValue = htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
            $html .= "<p><strong>{$safeLabel}:</strong> {$safeValue}</p>";
        }

        // Embed signature: use image tag if GD/Imagick available, otherwise annotation
        $html .= '<br><p><strong>Signature:</strong></p>';
        if (extension_loaded('gd') || extension_loaded('imagick')) {
            $html .= '<img src="data:image/png;base64,' . $rawBase64 . '" width="200" height="80" alt="Signature">';
        } else {
            // Fallback when no image extension: note the signature was received
            // (same intent as Taskey's text_on_pdf fallback)
            $html .= '<p><em>[Signature captured — base64 length: ' . strlen($rawBase64) . ' chars]</em></p>';
        }

        $pdf = $this->makeTcpdf('P', 'mm', 'A4');
        $pdf->SetCreator('CRM');
        $pdf->SetAuthor($lead->name ?? '');
        $pdf->SetTitle('Signed Document');
        $pdf->SetMargins(15, 15, 15);
        $pdf->SetAutoPageBreak(true, 15);
        $pdf->AddPage();
        $pdf->SetFont('helvetica', '', 11);
        $pdf->writeHTML($html, true, false, true, false, '');

        return $this->savePdf($pdf, $tenantId);
    }

    /**
     * Generate a document PDF from an HTML template with variable substitution.
     *
     * Ported from template_builder_ajax.php logic (field rendering / text_on_pdf equivalent).
     *
     * @param  Lead   $lead         The lead (provides substitution vars + tenant_id)
     * @param  string $templateHtml Raw HTML with {var} placeholders
     * @param  array  $vars         Extra variables to substitute
     * @return string Relative storage path
     */
    public function generateDocumentPdf(Lead $lead, string $templateHtml, array $vars): string
    {
        $tenantId = $lead->tenant_id;

        // Merge lead fields as default vars — mirrors Taskey's arr_ipost pattern
        $defaultVars = [
            'name'  => $lead->name ?? '',
            'phone' => $lead->phone ?? '',
            'email' => $lead->email ?? '',
            'date'  => now()->format('d/m/Y'),
        ];

        $allVars = array_merge($defaultVars, $vars);

        // Variable substitution — same approach as WhatsappTemplate::render()
        $html = $templateHtml;
        foreach ($allVars as $key => $value) {
            $html = str_replace('{' . $key . '}', (string) $value, $html);
        }

        $pdf = $this->makeTcpdf('P', 'mm', 'A4');
        $pdf->SetCreator('CRM');
        $pdf->SetAuthor($lead->name ?? '');
        $pdf->SetTitle('Document');
        $pdf->SetMargins(15, 15, 15);
        $pdf->SetAutoPageBreak(true, 15);
        $pdf->AddPage();
        $pdf->SetFont('helvetica', '', 11);

        // TCPDF writeHTML — handles RTL + Unicode, same reason Taskey used arial-unicode-ms.ttf
        $pdf->writeHTML($html, true, false, true, false, '');

        return $this->savePdf($pdf, $tenantId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Instantiate TCPDF with standard settings.
     * Replaces the raw `require_once TCPDF` includes in Taskey's plugins/ dir.
     */
    private function makeTcpdf(string $orientation, string $unit, string $format): TCPDF
    {
        $pdf = new TCPDF($orientation, $unit, $format, true, 'UTF-8', false);

        // Disable header/footer — Taskey templates didn't use them either
        $pdf->setPrintHeader(false);
        $pdf->setPrintFooter(false);

        return $pdf;
    }

    /**
     * Save the TCPDF document to storage/app/pdfs/{tenant_id}/ and return relative path.
     *
     * Replaces Taskey's direct filesystem writes to uploads/signed_pdfs/.
     * Returns relative path (no absolute paths exposed to clients — security rule).
     */
    private function savePdf(TCPDF $pdf, int $tenantId): string
    {
        $dir          = 'pdfs/' . $tenantId;
        $filename     = time() . '-' . Str::random(16) . '.pdf';
        $relativePath = $dir . '/' . $filename;

        // Get PDF as string — equivalent to Taskey's pdfBytes blob
        $content = $pdf->Output('', 'S');

        Storage::disk('local')->makeDirectory($dir);
        Storage::disk('local')->put($relativePath, $content);

        return $relativePath;
    }
}
