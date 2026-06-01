<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\AutomationController;
use App\Http\Controllers\ContactController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\FormController;
use App\Http\Controllers\IntegrationsController;
use App\Http\Controllers\LandingPageController;
use App\Http\Controllers\LeadController;
use App\Http\Controllers\PdfController;
use App\Http\Controllers\PipelineController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

// ── Public routes (no auth) ────────────────────────────────────────────────
Route::post('/auth/login', [AuthController::class, 'login']);

// Landing page builder — public render & form submission
Route::get('/lp/{tenant}/{slug}',         [LandingPageController::class, 'render']);
Route::post('/lp/{tenant}/{slug}/submit',  [LandingPageController::class, 'submitForm'])
    ->middleware('throttle:10,1');

Route::get('/forms/{slug}', [FormController::class, 'showPublic']);
Route::post('/forms/{slug}/submit', [FormController::class, 'submit'])
    ->middleware(['throttle:10,1']); // 10 requests per minute per IP

// Public GREEN-API webhook — resolves tenant from URL, no auth/session.
Route::post('/integrations/whatsapp/webhook/{tenant}', [IntegrationsController::class, 'whatsappWebhook']);

// Public Paycall PBX webhook — Paycall POSTs call metadata here, no auth/session.
Route::post('/integrations/paycall/webhook/{tenant}', [IntegrationsController::class, 'paycallWebhook'])
    ->middleware('throttle:60,1');

// Public Cardcom result webhook — GET or POST from Cardcom after payment, no auth.
Route::any('/integrations/cardcom/result/{tenant}', [IntegrationsController::class, 'cardcomResult']);

// ── PDF / Digital Signature — Public routes ───────────────────────────────
// Ported from Taskey webapi/sign_document_v2.php + signature_form_to_pdf.php
Route::get('/pdf/sign/{tenant}/{token}', [PdfController::class, 'signatureForm']);
Route::post('/pdf/sign/{tenant}/{token}', [PdfController::class, 'signatureSubmit']);
Route::get('/pdf/download/{tenant}/{filename}', [PdfController::class, 'download']);

// ── Protected routes ───────────────────────────────────────────────────────
Route::middleware(['auth:sanctum', 'tenant'])->group(function () {

    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    // Leads
    Route::get('/leads', [LeadController::class, 'index'])
        ->middleware('permission:leads,can_read');
    Route::post('/leads', [LeadController::class, 'store'])
        ->middleware('permission:leads,can_create');
    Route::post('/leads/bulk', [LeadController::class, 'bulk'])
        ->middleware('permission:leads,can_update');
    Route::delete('/leads/all/clear', [LeadController::class, 'deleteAll'])
        ->middleware('permission:leads,can_delete');
    Route::get('/leads/{lead}', [LeadController::class, 'show'])
        ->middleware('permission:leads,can_read');
    Route::put('/leads/{lead}', [LeadController::class, 'update'])
        ->middleware('permission:leads,can_update');
    Route::delete('/leads/{lead}', [LeadController::class, 'destroy'])
        ->middleware('permission:leads,can_delete');
    Route::put('/leads/{lead}/stage', [LeadController::class, 'changeStage'])
        ->middleware('permission:leads,can_update');
    Route::get('/leads/{lead}/activities', [LeadController::class, 'activities'])
        ->middleware('permission:leads,can_read');
    Route::post('/leads/{lead}/activities', [LeadController::class, 'storeActivity'])
        ->middleware('permission:leads,can_create');

    // Import (CSV → leads)
    Route::post('/import/upload', [\App\Http\Controllers\ImportController::class, 'upload'])
        ->middleware('permission:leads,can_create');
    Route::post('/import/start', [\App\Http\Controllers\ImportController::class, 'start'])
        ->middleware('permission:leads,can_create');
    Route::get('/import/{import}', [\App\Http\Controllers\ImportController::class, 'status'])
        ->middleware('permission:leads,can_read');

    // Contacts
    Route::get('/contacts', [ContactController::class, 'index'])
        ->middleware('permission:contacts,can_read');
    Route::post('/contacts', [ContactController::class, 'store'])
        ->middleware('permission:contacts,can_create');
    Route::get('/contacts/{contact}', [ContactController::class, 'show'])
        ->middleware('permission:contacts,can_read');
    Route::put('/contacts/{contact}', [ContactController::class, 'update'])
        ->middleware('permission:contacts,can_update');
    Route::delete('/contacts/{contact}', [ContactController::class, 'destroy'])
        ->middleware('permission:contacts,can_delete');

    // Pipeline
    Route::get('/pipeline', [PipelineController::class, 'index'])
        ->middleware('permission:leads,can_read');
    Route::post('/pipeline', [PipelineController::class, 'store'])
        ->middleware('permission:leads,can_create');
    Route::put('/pipeline/reorder', [PipelineController::class, 'reorder'])
        ->middleware('permission:leads,can_update');
    Route::put('/pipeline/{pipeline}', [PipelineController::class, 'update'])
        ->middleware('permission:leads,can_update');
    Route::delete('/pipeline/{pipeline}', [PipelineController::class, 'destroy'])
        ->middleware('permission:leads,can_delete');

    // Automations
    Route::get('/automations', [AutomationController::class, 'index'])
        ->middleware('permission:automations,can_read');
    Route::post('/automations', [AutomationController::class, 'store'])
        ->middleware('permission:automations,can_create');
    Route::get('/automations/{automation}', [AutomationController::class, 'show'])
        ->middleware('permission:automations,can_read');
    Route::put('/automations/{automation}', [AutomationController::class, 'update'])
        ->middleware('permission:automations,can_update');
    Route::delete('/automations/{automation}', [AutomationController::class, 'destroy'])
        ->middleware('permission:automations,can_delete');
    Route::post('/automations/{automation}/toggle', [AutomationController::class, 'toggle'])
        ->middleware('permission:automations,can_update');

    // Forms (management — authenticated)
    Route::get('/forms', [FormController::class, 'index'])
        ->middleware('permission:forms,can_read');
    Route::post('/forms', [FormController::class, 'store'])
        ->middleware('permission:forms,can_create');
    Route::put('/forms/{form}', [FormController::class, 'update'])
        ->middleware('permission:forms,can_update');
    Route::delete('/forms/{form}', [FormController::class, 'destroy'])
        ->middleware('permission:forms,can_delete');

    // Landing pages (management — authenticated)
    Route::get('/landing-pages', [LandingPageController::class, 'index'])
        ->middleware('permission:forms,can_read');
    Route::post('/landing-pages', [LandingPageController::class, 'store'])
        ->middleware('permission:forms,can_create');
    Route::get('/landing-pages/{landing_page}', [LandingPageController::class, 'show'])
        ->middleware('permission:forms,can_read');
    Route::put('/landing-pages/{landing_page}', [LandingPageController::class, 'update'])
        ->middleware('permission:forms,can_update');
    Route::delete('/landing-pages/{landing_page}', [LandingPageController::class, 'destroy'])
        ->middleware('permission:forms,can_delete');

    // Users
    Route::get('/users', [UserController::class, 'index'])
        ->middleware('permission:users,can_read');
    Route::post('/users', [UserController::class, 'store'])
        ->middleware('permission:users,can_create');
    Route::put('/users/{user}', [UserController::class, 'update'])
        ->middleware('permission:users,can_update');
    Route::delete('/users/{user}', [UserController::class, 'destroy'])
        ->middleware('permission:users,can_delete');

    // Integrations — Green Invoice
    Route::get('/integrations/settings', [IntegrationsController::class, 'getSettings'])
        ->middleware('permission:users,can_update');
    Route::put('/integrations/settings', [IntegrationsController::class, 'saveSettings'])
        ->middleware('permission:users,can_update');
    Route::post('/integrations/greeninvoice/test', [IntegrationsController::class, 'greenInvoiceTest'])
        ->middleware('permission:users,can_update');
    Route::post('/integrations/greeninvoice/lead/{lead}', [IntegrationsController::class, 'greenInvoiceCreate'])
        ->middleware('permission:leads,can_update');

    // Integrations — WhatsApp (GREEN-API)
    Route::post('/integrations/whatsapp/test', [IntegrationsController::class, 'whatsappTest'])
        ->middleware('permission:users,can_update');
    Route::post('/integrations/whatsapp/lead/{lead}', [IntegrationsController::class, 'whatsappSend'])
        ->middleware('permission:leads,can_update');

    // Integrations — Cardcom payment
    Route::post('/integrations/cardcom/lead/{lead}', [IntegrationsController::class, 'cardcomCreatePage'])
        ->middleware('permission:leads,can_update');

    // Integrations — Yesh Invoice (יש חשבונית)
    Route::post('/integrations/yeshinvoice/test', [IntegrationsController::class, 'yeshInvoiceTest'])
        ->middleware('permission:users,can_update');
    Route::post('/integrations/yeshinvoice/lead/{lead}', [IntegrationsController::class, 'yeshInvoiceCreate'])
        ->middleware('permission:leads,can_update');

    // WhatsApp templates
    Route::get('/whatsapp-templates', [\App\Http\Controllers\WhatsappTemplateController::class, 'index'])
        ->middleware('permission:leads,can_read');
    Route::post('/whatsapp-templates', [\App\Http\Controllers\WhatsappTemplateController::class, 'store'])
        ->middleware('permission:leads,can_update');
    Route::put('/whatsapp-templates/{whatsapp_template}', [\App\Http\Controllers\WhatsappTemplateController::class, 'update'])
        ->middleware('permission:leads,can_update');
    Route::delete('/whatsapp-templates/{whatsapp_template}', [\App\Http\Controllers\WhatsappTemplateController::class, 'destroy'])
        ->middleware('permission:leads,can_update');

    // Settings
    Route::get('/settings/tenant', [SettingsController::class, 'getTenant']);
    Route::put('/settings/tenant', [SettingsController::class, 'updateTenant'])
        ->middleware('permission:users,can_update');
    Route::get('/settings/permissions', [SettingsController::class, 'getPermissions']);
    Route::put('/settings/permissions', [SettingsController::class, 'updatePermissions'])
        ->middleware('permission:users,can_update');
    Route::get('/settings/labels', [SettingsController::class, 'getLabels']);
    Route::put('/settings/labels', [SettingsController::class, 'updateLabels'])
        ->middleware('permission:users,can_update');

    // Dashboard
    Route::get('/dashboard/stats', [DashboardController::class, 'stats'])
        ->middleware('permission:reports,can_read');
    Route::get('/dashboard/chart-data', [DashboardController::class, 'chartData'])
        ->middleware('permission:reports,can_read');

    // Dashboard — Advanced Reports
    Route::get('/dashboard/reports/leads-by-source', [DashboardController::class, 'reportLeadsBySource'])
        ->middleware('permission:reports,can_read');
    Route::get('/dashboard/reports/leads-by-agent', [DashboardController::class, 'reportLeadsByAgent'])
        ->middleware('permission:reports,can_read');
    Route::get('/dashboard/reports/activities', [DashboardController::class, 'reportActivities'])
        ->middleware('permission:reports,can_read');
    Route::get('/dashboard/reports/conversion', [DashboardController::class, 'reportConversion'])
        ->middleware('permission:reports,can_read');
    Route::get('/dashboard/reports/export', [DashboardController::class, 'exportLeads'])
        ->middleware('permission:reports,can_read');

    // ── PDF / Digital Signature — Protected routes ─────────────────────────
    // Ported from Taskey lead_signature_ajax.php (pdf_sig_v2_send_to_lead_event)
    Route::post('/pdf/token/lead/{lead}', [PdfController::class, 'createToken'])
        ->middleware('permission:leads,can_update');
    Route::post('/pdf/generate/lead/{lead}', [PdfController::class, 'generateDocument'])
        ->middleware('permission:leads,can_update');
});
