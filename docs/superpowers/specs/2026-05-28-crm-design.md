# CRM SaaS Platform — Design Spec
**Date:** 2026-05-28  
**Phase:** 1 (Core CRM)  
**Stack:** Laravel 11 + React 19 + MySQL

---

## 1. Product Overview

SaaS CRM platform sold to businesses as a multi-tenant product. The owner's business provides full business accompaniment services (CRM, automations, management systems). This platform is their core product offering.

**Not:** a fork or copy of Taskey. Inspired by its architecture concepts only.

---

## 2. Scope — Phase 1

**In scope:**
- Leads management + visual pipeline (Kanban)
- Contacts (individuals + companies)
- Automations (trigger → condition → action)
- Forms (lead capture, public URL)
- Dashboard + basic reports
- User management + role-based permissions
- Multi-tenancy (shared DB, tenant_id)

**Out of scope (future phases):**
- Digital signatures
- Invoice/receipt system integrations
- PBX / phone system integrations
- Landing page builder
- Advanced reports
- White-label
- Public API

---

## 3. Architecture

**Pattern:** Laravel REST API + React SPA (decoupled)

```
React SPA (Vite)  ←→  Laravel 11 REST API  ←→  MySQL (shared)
```

- Laravel serves JSON only — no Blade views
- React is a standalone SPA, communicates via HTTP
- Single MySQL database, all tenants share it
- Every table has `tenant_id`; Eloquent Global Scope auto-filters per request

### Request Lifecycle
```
HTTP Request
  → TenantMiddleware   (subdomain → resolve tenant_id)
  → auth:sanctum       (validate Bearer token)
  → CheckPermission    (role + module + action)
  → Controller → Service → Model
  → JSON Response
```

### Multi-Tenancy
- Tenant identified by subdomain: `acme.crm.co.il`
- `TenantMiddleware` resolves tenant from `tenants` table and sets it on the request
- All Models use `HasTenantScope` trait → auto WHERE tenant_id = ? on every query
- No cross-tenant data leakage possible without explicitly removing scope

---

## 4. Database Schema

### Core Tables

```sql
tenants
  id, name, subdomain, plan, status, created_at, updated_at

users
  id, tenant_id, name, email, password, role, status, created_at

leads
  id, tenant_id, name, phone, email, status
  pipeline_stage_id, assigned_to (user_id)
  source, notes, custom_fields (JSON), created_at

pipeline_stages
  id, tenant_id, name, color, position, type (lead|sales|custom)
  -- NOTE: field named 'position' not 'order' (reserved word in MySQL)

contacts
  id, tenant_id, name, phone, email
  company, tags (JSON), custom_fields (JSON), created_at

activities
  id, tenant_id, entity_type, entity_id
  type (call|note|email|meeting|task)
  body, user_id, created_at

automations
  id, tenant_id, name, trigger_type
  conditions (JSON), actions (JSON), active (bool), created_at

automation_logs
  id, automation_id, entity_type, entity_id
  status (success|failed), error_message, ran_at

forms
  id, tenant_id, name, slug (unique, auto-generated from name + random suffix), fields (JSON)
  destination_pipeline_id, active, created_at

form_submissions
  id, form_id, tenant_id, data (JSON), created_at

roles_permissions
  id, tenant_id, role, module, can_create, can_read, can_update, can_delete
```

All tables (except `tenants`) have `tenant_id` with a foreign key to `tenants.id`.

`custom_fields` on leads and contacts is a JSON column — allows per-tenant custom fields without schema migrations.

---

## 5. Authentication & Authorization

### Auth
- Laravel Sanctum — SPA mode (httpOnly cookie, NOT localStorage)
- Login endpoint sets httpOnly cookie via Sanctum + returns `{ user, permissions[] }`
- CSRF protection via Sanctum's `/sanctum/csrf-cookie` endpoint
- Every request sends cookie automatically + `X-XSRF-TOKEN` header
- Token NEVER exposed to JavaScript (XSS protection)

### Roles
| Role | Description |
|------|-------------|
| `super_admin` | All access + tenant settings |
| `admin` | All modules, no tenant-level settings |
| `manager` | Read + edit, no delete |
| `agent` | Own records only (records where assigned_to = their user_id) |

### Permission Matrix
| Module | super_admin | admin | manager | agent |
|--------|-------------|-------|---------|-------|
| Leads | CRUD | CRUD | CRU | CR (own) |
| Contacts | CRUD | CRUD | CRU | CRU |
| Automations | CRUD | CRUD | R | — |
| Forms | CRUD | CRUD | R | — |
| Users | CRUD | CRU | R | — |
| Reports | ✅ | ✅ | ✅ | own |

`CheckPermission` middleware receives `module` + `action` from route definition and checks against `roles_permissions` table (tenant-customizable) or falls back to default matrix.

---

## 6. API Routes

All routes prefixed `/api/`, protected by `auth:sanctum` + `TenantMiddleware` unless noted.

### Auth
```
POST   /api/auth/login         (public)
POST   /api/auth/logout
GET    /api/auth/me
```

### Leads
```
GET    /api/leads              (filterable: stage, assigned_to, source, search)
POST   /api/leads
GET    /api/leads/{id}
PUT    /api/leads/{id}
DELETE /api/leads/{id}
PUT    /api/leads/{id}/stage   (pipeline drag-drop)
GET    /api/leads/{id}/activities
POST   /api/leads/{id}/activities
```

### Contacts
```
GET    /api/contacts
POST   /api/contacts
GET    /api/contacts/{id}
PUT    /api/contacts/{id}
DELETE /api/contacts/{id}
```

### Pipeline
```
GET    /api/pipelines
POST   /api/pipelines
PUT    /api/pipelines/{id}
DELETE /api/pipelines/{id}
PUT    /api/pipelines/reorder  (bulk order update)
```

### Automations
```
GET    /api/automations
POST   /api/automations
GET    /api/automations/{id}
PUT    /api/automations/{id}
DELETE /api/automations/{id}
POST   /api/automations/{id}/toggle
```

### Forms
```
GET    /api/forms
POST   /api/forms
PUT    /api/forms/{id}
DELETE /api/forms/{id}
GET    /api/forms/{slug}        (public — no auth)
POST   /api/forms/{slug}/submit (public — no auth)
```

### Users & Settings
```
GET    /api/users
POST   /api/users
PUT    /api/users/{id}
DELETE /api/users/{id}
GET    /api/settings/tenant
PUT    /api/settings/tenant
GET    /api/settings/permissions
PUT    /api/settings/permissions
```

### Dashboard
```
GET    /api/dashboard/stats
GET    /api/dashboard/chart-data
```

---

## 7. Automation Engine

### Data Model
Each automation stores:
```json
{
  "trigger_type": "lead_created",
  "conditions": [
    { "field": "source", "operator": "=", "value": "facebook" }
  ],
  "actions": [
    { "type": "send_email", "template": "welcome" },
    { "type": "assign_to", "user_id": 7 },
    { "type": "change_stage", "stage_id": 2 }
  ]
}
```

### Flow
1. Domain event fires (e.g., `LeadCreated`)
2. `AutomationEngine::fire($triggerType, $entity)` called
3. Fetch all active automations matching trigger + tenant
4. Evaluate conditions against entity fields
5. Dispatch `RunAutomationJob` to queue for each matching automation
6. Job executes actions sequentially
7. Log result to `automation_logs`

### Phase 1 Triggers
- `lead_created`
- `lead_stage_changed`
- `form_submitted`
- `contact_created`
- `scheduled` (cron — daily / hourly)

### Phase 1 Actions
- `send_email` (via Laravel Mail)
- `send_whatsapp` (via configurable WhatsApp provider per tenant — supports 360dialog / UltraMsg / Twilio / SmartSend, configured in tenant settings)
- `assign_to` (user)
- `change_stage`
- `add_tag`
- `create_activity` (note / task)

### Reliability
- Jobs run via Laravel Queue (database driver for Phase 1, Redis for scale)
- 3 automatic retries on failure
- Failed jobs logged to `automation_logs` with error message

---

## 8. Frontend Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── leads/
│   │   ├── contacts/
│   │   ├── pipeline/
│   │   ├── automations/
│   │   ├── forms/
│   │   ├── dashboard/
│   │   └── settings/
│   ├── components/
│   │   ├── ui/          (Button, Modal, Table, Badge, Input — shared)
│   │   └── domain/      (LeadCard, PipelineColumn, AutomationRow…)
│   ├── api/             (axios instance + per-module API calls)
│   ├── hooks/           (useLeads, useContacts, useAutomations…)
│   ├── context/
│   │   ├── AuthContext.jsx
│   │   └── TenantContext.jsx
│   └── App.jsx
├── vite.config.js
└── package.json
```

**Key decisions:**
- TanStack Query for server state (cache, refetch, optimistic updates)
- React Router v7 for navigation
- Tailwind CSS for styling
- RTL support via `dir="rtl"` on root + Tailwind RTL plugin
- Axios instance injects `Authorization` header + `tenant` on every request

---

## 9. Error Handling

### API Response Format (always consistent)
```json
// Success
{ "success": true, "data": { ... } }

// Error
{
  "success": false,
  "message": "Validation failed",
  "errors": { "email": ["שדה חובה"] },
  "code": 422
}
```

### HTTP Status Codes
- `200` success, `201` created
- `401` unauthenticated, `403` unauthorized
- `404` not found, `422` validation error, `500` server error

### Validation
- Laravel `FormRequest` class per endpoint (e.g., `StoreLeadRequest`)
- Error messages in Hebrew by default, configurable per tenant locale

### Logging
- Laravel default logger → `storage/logs/laravel.log`
- Automation failures → `automation_logs` table
- 500 errors → optional Slack webhook notification

---

## 10. Testing Strategy

### Backend (PHPUnit)
- Feature test per controller
- Required tests:
  - Tenant isolation: user from tenant A cannot read tenant B data
  - Permission gates: agent cannot delete, manager cannot access automations
  - Automation trigger + condition evaluation
  - Form submission creates lead in correct pipeline

### Frontend (Vitest)
- Unit tests on hooks and utility functions only
- No component rendering tests in Phase 1

---

## 11. Directory Structure — Backend

```
backend/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── AuthController.php
│   │   │   ├── LeadController.php
│   │   │   ├── ContactController.php
│   │   │   ├── PipelineController.php
│   │   │   ├── AutomationController.php
│   │   │   ├── FormController.php
│   │   │   ├── UserController.php
│   │   │   └── DashboardController.php
│   │   ├── Middleware/
│   │   │   ├── TenantMiddleware.php
│   │   │   └── CheckPermission.php
│   │   └── Requests/
│   │       ├── StoreLeadRequest.php
│   │       └── (one per endpoint with validation)
│   ├── Models/
│   │   ├── Tenant.php
│   │   ├── User.php
│   │   ├── Lead.php          (uses HasTenantScope)
│   │   ├── Contact.php
│   │   ├── PipelineStage.php
│   │   ├── Activity.php
│   │   ├── Automation.php
│   │   └── Form.php
│   ├── Services/
│   │   ├── AutomationEngine.php
│   │   ├── LeadService.php
│   │   └── NotificationService.php
│   ├── Jobs/
│   │   └── RunAutomationJob.php
│   └── Traits/
│       └── HasTenantScope.php
├── database/
│   └── migrations/
├── routes/
│   └── api.php
└── tests/Feature/
```

---

## 12. Phase Roadmap

| Phase | Modules |
|-------|---------|
| **1** (current) | Core CRM: leads, contacts, pipeline, users, automations, forms, dashboard |
| **2** | Landing page builder, advanced automations, WhatsApp templates |
| **3** | Digital signatures, invoice integrations, PBX integrations |
| **4** | Advanced reports, white-label, public API |
