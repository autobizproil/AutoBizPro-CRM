# Generic Advanced Filter System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Leads' date-range + multi-condition filter logic into a shared backend service and reusable frontend wiring pattern, then apply it to Contacts, Clients, Tasks, and the generic custom-record-type page — giving all five entities the same advanced filtering Leads already has, with one shared code path instead of five.

**Architecture:** One new backend service (`App\Services\ConditionFilter`) generalizes `LeadService::applyConditions`, parameterized per entity by its whitelisted system fields and (optionally) a JSON custom-fields column. Each entity's `index()` controller method gains the same `conditions`/`date_from`/`date_to` query params Leads already accepts. On the frontend, the already-generic `FilterPanel.jsx` component is reused unchanged across all five pages; each page gains its own `FILTER_FIELDS` list (from that entity's `CustomFieldDefinition` rows) and `advFilter` state, mirroring `LeadsPage.jsx`'s existing pattern exactly.

**Tech Stack:** Laravel 10 (PHP), PHPUnit feature tests, React + TanStack Query.

## Global Constraints

- `FilterPanel.jsx` (`frontend/src/pages/leads/FilterPanel.jsx`) is not modified — it is already generic (takes `fields`/`conditions` props, emits `onApply`).
- Leads' own filtering behavior must not change — `LeadService::applyConditions` is replaced with a call to the shared service, not rewritten; existing Lead filter tests (if any pass today) must keep passing.
- Tasks has no `custom_fields` column — its filtering is system-fields-only. This is not fixed as part of this plan.
- Records: every field lives in the `data` JSON column, keyed by the field's own `name` (no `cf_` prefix) — this is a distinct mode from Leads/Contacts/Clients.
- Spec: `docs/superpowers/specs/2026-07-26-generic-advanced-filters-design.md`

---

### Task 1: `ConditionFilter` shared service + Leads regression tests + refactor

**Files:**
- Create: `backend/app/Services/ConditionFilter.php`
- Test: `backend/tests/Feature/ConditionFilterTest.php`
- Modify: `backend/app/Services/LeadService.php:64-104` (replace `applyConditions` body with a call to the new service; keep the method as a thin wrapper so `LeadService::list` doesn't need to change)

**Interfaces:**
- Produces: `ConditionFilter::apply($query, array $conditions, array $systemFields, ?string $jsonColumn = null, bool $allFieldsAreJson = false): void` — static method, mutates `$query` in place (same calling convention as the original `applyConditions`). Tasks 2-5 all call this exact signature.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/Feature/ConditionFilterTest.php`:

```php
<?php
namespace Tests\Feature;

use App\Models\Lead;
use App\Models\Tenant;
use App\Services\ConditionFilter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConditionFilterTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenant(string $sub): int
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        return $tenant->id;
    }

    public function test_equals_on_system_field(): void
    {
        $this->setupTenant('cf-eq');
        Lead::create(['name' => 'Alice', 'source' => 'web']);
        Lead::create(['name' => 'Bob', 'source' => 'phone']);

        $query = Lead::query();
        ConditionFilter::apply($query, [['field' => 'source', 'operator' => 'equals', 'value' => 'web']], ['name', 'source'], 'custom_fields');

        $results = $query->get();
        $this->assertCount(1, $results);
        $this->assertSame('Alice', $results->first()->name);
    }

    public function test_contains_on_json_custom_field_with_cf_prefix(): void
    {
        $this->setupTenant('cf-json');
        Lead::create(['name' => 'A', 'custom_fields' => ['budget_tier' => 'gold']]);
        Lead::create(['name' => 'B', 'custom_fields' => ['budget_tier' => 'silver']]);

        $query = Lead::query();
        ConditionFilter::apply($query, [['field' => 'cf_budget_tier', 'operator' => 'contains', 'value' => 'gol']], ['name'], 'custom_fields');

        $results = $query->get();
        $this->assertCount(1, $results);
        $this->assertSame('A', $results->first()->name);
    }

    public function test_field_not_in_whitelist_and_not_cf_prefixed_is_ignored(): void
    {
        $this->setupTenant('cf-wl');
        Lead::create(['name' => 'A', 'phone' => '111']);
        Lead::create(['name' => 'B', 'phone' => '222']);

        $query = Lead::query();
        // 'phone' is not in the whitelist passed here, so this condition must be a no-op
        ConditionFilter::apply($query, [['field' => 'phone', 'operator' => 'equals', 'value' => '111']], ['name'], 'custom_fields');

        $this->assertCount(2, $query->get());
    }

    public function test_all_fields_are_json_mode_targets_data_column_directly(): void
    {
        $tenantId = $this->setupTenant('cf-afaj');
        $type = \App\Models\RecordType::create(['tenant_id' => $tenantId, 'slug' => 'invoices', 'label' => 'Invoices', 'position' => 0]);
        \App\Models\Record::create(['tenant_id' => $tenantId, 'record_type_id' => $type->id, 'data' => ['title' => 'A', 'amount' => '100']]);
        \App\Models\Record::create(['tenant_id' => $tenantId, 'record_type_id' => $type->id, 'data' => ['title' => 'B', 'amount' => '200']]);

        $query = \App\Models\Record::where('record_type_id', $type->id);
        ConditionFilter::apply($query, [['field' => 'amount', 'operator' => 'equals', 'value' => '100']], [], 'data', true);

        $results = $query->get();
        $this->assertCount(1, $results);
        $this->assertSame('A', $results->first()->data['title']);
    }

    public function test_all_fields_are_json_mode_rejects_unsafe_field_name(): void
    {
        $tenantId = $this->setupTenant('cf-inj');
        $type = \App\Models\RecordType::create(['tenant_id' => $tenantId, 'slug' => 'invoices', 'label' => 'Invoices', 'position' => 0]);
        \App\Models\Record::create(['tenant_id' => $tenantId, 'record_type_id' => $type->id, 'data' => ['title' => 'A']]);

        $query = \App\Models\Record::where('record_type_id', $type->id);
        // Field name containing something that isn't [a-z0-9_] must be ignored, not interpolated into raw SQL
        ConditionFilter::apply($query, [['field' => "title') OR ('1'='1", 'operator' => 'equals', 'value' => 'A']], [], 'data', true);

        // The unsafe condition must be dropped entirely — count stays at the full unfiltered set (1)
        $this->assertCount(1, $query->get());
    }

    public function test_empty_operator(): void
    {
        $this->setupTenant('cf-empty');
        Lead::create(['name' => 'A', 'source' => '']);
        Lead::create(['name' => 'B', 'source' => 'web']);

        $query = Lead::query();
        ConditionFilter::apply($query, [['field' => 'source', 'operator' => 'empty']], ['name', 'source'], 'custom_fields');

        $results = $query->get();
        $this->assertCount(1, $results);
        $this->assertSame('A', $results->first()->name);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=ConditionFilterTest`
Expected: FAIL (class `App\Services\ConditionFilter` does not exist)

- [ ] **Step 3: Write the service**

Create `backend/app/Services/ConditionFilter.php`:

```php
<?php

namespace App\Services;

class ConditionFilter
{
    private const OPERATORS = ['equals', 'not_equals', 'contains', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty'];

    /**
     * Apply Fireberry-style multi-condition filters to a query.
     *
     * @param  array<int, array{field?: string, operator?: string, value?: mixed}>  $conditions
     * @param  array<int, string>  $systemFields  whitelisted direct-column field names (ignored when $allFieldsAreJson)
     * @param  string|null  $jsonColumn  column name holding JSON fields, or null if this entity has none
     * @param  bool  $allFieldsAreJson  true when every field (no 'cf_' prefix) resolves through $jsonColumn,
     *                                  e.g. custom record types where everything lives in `data`
     */
    public static function apply($query, array $conditions, array $systemFields, ?string $jsonColumn = null, bool $allFieldsAreJson = false): void
    {
        foreach ($conditions as $cond) {
            $field    = $cond['field'] ?? null;
            $operator = $cond['operator'] ?? null;
            $value    = $cond['value'] ?? null;

            if (! $field || ! in_array($operator, self::OPERATORS, true)) {
                continue;
            }

            if ($allFieldsAreJson) {
                if (! $jsonColumn || ! preg_match('/^[a-z0-9_]+$/', (string) $field)) {
                    continue;
                }
                $column = \Illuminate\Support\Facades\DB::raw("JSON_UNQUOTE(JSON_EXTRACT(`{$jsonColumn}`, '$.\"" . $field . "\"'))");
            } else {
                $isCustom = $jsonColumn && str_starts_with((string) $field, 'cf_') && preg_match('/^cf_[a-z0-9_]+$/', $field);
                if (! $isCustom && ! in_array($field, $systemFields, true)) {
                    continue;
                }
                $column = $isCustom
                    ? \Illuminate\Support\Facades\DB::raw("JSON_UNQUOTE(JSON_EXTRACT(`{$jsonColumn}`, '$.\"" . substr($field, 3) . "\"'))")
                    : $field;
            }

            match ($operator) {
                'equals'     => $query->where($column, '=', $value),
                'not_equals' => $query->where($column, '!=', $value),
                'contains'   => $query->where($column, 'like', "%{$value}%"),
                'gt'         => $query->where($column, '>', $value),
                'gte'        => $query->where($column, '>=', $value),
                'lt'         => $query->where($column, '<', $value),
                'lte'        => $query->where($column, '<=', $value),
                'empty'      => $query->where(fn ($q) => $q->whereNull($column)->orWhere($column, '=', '')),
                'not_empty'  => $query->where(fn ($q) => $q->whereNotNull($column)->where($column, '!=', '')),
                default      => null,
            };
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=ConditionFilterTest`
Expected: PASS, 6/6

- [ ] **Step 5: Refactor `LeadService` to delegate to the new service**

In `backend/app/Services/LeadService.php`, replace the body of `applyConditions` (lines 71-104) with:

```php
    private function applyConditions($query, array $conditions): void
    {
        ConditionFilter::apply($query, $conditions, self::FILTERABLE_FIELDS, 'custom_fields');
    }
```

Add the import at the top of the file (near the other `use` statements):

```php
use App\Services\ConditionFilter;
```

Remove the now-unused `FILTER_OPERATORS` constant (line 14) — it moved into `ConditionFilter::OPERATORS`.

- [ ] **Step 6: Run the full backend suite to confirm no regression**

Run: `cd backend && php artisan test`
Expected: PASS — same pass count as before this task (159 passing at the time this plan was written), confirming the refactor didn't change Leads' behavior.

- [ ] **Step 7: Commit**

```bash
git add backend/app/Services/ConditionFilter.php backend/app/Services/LeadService.php backend/tests/Feature/ConditionFilterTest.php
git commit -m "feat: extract shared ConditionFilter service from LeadService"
```

---

### Task 2: Wire filtering into Contacts

**Files:**
- Modify: `backend/app/Http/Controllers/ContactController.php:15-27` (`index` method)
- Test: `backend/tests/Feature/ContactFilterTest.php`

**Interfaces:**
- Consumes: `ConditionFilter::apply(...)` from Task 1.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/ContactFilterTest.php`:

```php
<?php
namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ContactFilterTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $sub): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        return [$tenant, $admin, $sub];
    }

    public function test_filters_contacts_by_condition(): void
    {
        [$tenant, $admin, $sub] = $this->admin('contact-filter');
        app()->instance('current_tenant_id', $tenant->id);
        Contact::create(['tenant_id' => $tenant->id, 'name' => 'Alice', 'company' => 'Acme']);
        Contact::create(['tenant_id' => $tenant->id, 'name' => 'Bob', 'company' => 'Other']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/contacts?' . http_build_query([
                'conditions' => json_encode([['field' => 'company', 'operator' => 'equals', 'value' => 'Acme']]),
            ]));

        $resp->assertOk();
        $this->assertCount(1, $resp->json('data.data'));
        $this->assertSame('Alice', $resp->json('data.data.0.name'));
    }

    public function test_filters_contacts_by_date_range(): void
    {
        [$tenant, $admin, $sub] = $this->admin('contact-date');
        app()->instance('current_tenant_id', $tenant->id);
        $old = Contact::create(['tenant_id' => $tenant->id, 'name' => 'Old']);
        $old->created_at = now()->subDays(30);
        $old->saveQuietly();
        Contact::create(['tenant_id' => $tenant->id, 'name' => 'New']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/contacts?date_from=' . now()->subDay()->toIso8601String());

        $resp->assertOk();
        $this->assertCount(1, $resp->json('data.data'));
        $this->assertSame('New', $resp->json('data.data.0.name'));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=ContactFilterTest`
Expected: FAIL (conditions/date_from params are currently ignored by `ContactController::index`)

- [ ] **Step 3: Wire the controller**

In `backend/app/Http/Controllers/ContactController.php`, replace the `index` method (lines 15-27) with:

```php
    public function index(Request $request): JsonResponse
    {
        $query = Contact::query();

        if ($s = $request->search) {
            $query->where(fn ($q) => $q->where('name', 'like', "%$s%")
                ->orWhere('email', 'like', "%$s%")
                ->orWhere('phone', 'like', "%$s%")
                ->orWhere('company', 'like', "%$s%"));
        }

        if ($request->filled('date_from')) {
            $query->where('created_at', '>=', $request->input('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->where('created_at', '<=', $request->input('date_to'));
        }
        if ($request->filled('conditions')) {
            $decoded = json_decode($request->input('conditions'), true);
            \App\Services\ConditionFilter::apply($query, is_array($decoded) ? $decoded : [], ['name', 'phone', 'email', 'company', 'role', 'created_at'], 'custom_fields');
        }

        return response()->json(['success' => true, 'data' => $query->latest()->paginate(25)]);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=ContactFilterTest`
Expected: PASS, 2/2

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/ContactController.php backend/tests/Feature/ContactFilterTest.php
git commit -m "feat: add advanced filtering to Contacts list endpoint"
```

---

### Task 3: Wire filtering into Clients

**Files:**
- Modify: `backend/app/Http/Controllers/ClientController.php:13-27` (`index` method)
- Test: `backend/tests/Feature/ClientFilterTest.php`

**Interfaces:**
- Consumes: `ConditionFilter::apply(...)` from Task 1.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/ClientFilterTest.php`:

```php
<?php
namespace Tests\Feature;

use App\Models\Client;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ClientFilterTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $sub): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        return [$tenant, $admin, $sub];
    }

    public function test_filters_clients_by_condition(): void
    {
        [$tenant, $admin, $sub] = $this->admin('client-filter');
        app()->instance('current_tenant_id', $tenant->id);
        Client::create(['tenant_id' => $tenant->id, 'name' => 'Alice', 'source' => 'referral']);
        Client::create(['tenant_id' => $tenant->id, 'name' => 'Bob', 'source' => 'web']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/clients?' . http_build_query([
                'conditions' => json_encode([['field' => 'source', 'operator' => 'equals', 'value' => 'referral']]),
            ]));

        $resp->assertOk();
        $this->assertCount(1, $resp->json('data.data'));
        $this->assertSame('Alice', $resp->json('data.data.0.name'));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=ClientFilterTest`
Expected: FAIL

- [ ] **Step 3: Wire the controller**

In `backend/app/Http/Controllers/ClientController.php`, replace the `index` method (lines 13-27) with:

```php
    public function index(Request $request): JsonResponse
    {
        $q     = $request->get('search', '');
        $query = Client::with(['assignedUser'])
            ->when($q, fn ($qr) => $qr->where(fn ($q2) =>
                $q2->where('name', 'like', "%$q%")
                   ->orWhere('phone', 'like', "%$q%")
                   ->orWhere('email', 'like', "%$q%")
                   ->orWhere('company', 'like', "%$q%")
            ));

        if ($request->filled('date_from')) {
            $query->where('created_at', '>=', $request->input('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->where('created_at', '<=', $request->input('date_to'));
        }
        if ($request->filled('conditions')) {
            $decoded = json_decode($request->input('conditions'), true);
            \App\Services\ConditionFilter::apply($query, is_array($decoded) ? $decoded : [], ['name', 'phone', 'email', 'company', 'source', 'assigned_to', 'created_at'], 'custom_fields');
        }

        return response()->json(['success' => true, 'data' => $query->latest()->paginate(25)]);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=ClientFilterTest`
Expected: PASS, 1/1

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/ClientController.php backend/tests/Feature/ClientFilterTest.php
git commit -m "feat: add advanced filtering to Clients list endpoint"
```

---

### Task 4: Wire filtering into Tasks

**Files:**
- Modify: `backend/app/Http/Controllers/TaskController.php:12-44` (`index` method)
- Test: `backend/tests/Feature/TaskFilterTest.php`

**Interfaces:**
- Consumes: `ConditionFilter::apply(...)` from Task 1.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/TaskFilterTest.php`:

```php
<?php
namespace Tests\Feature;

use App\Models\Task;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class TaskFilterTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $sub): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        return [$tenant, $admin, $sub];
    }

    public function test_filters_tasks_by_condition(): void
    {
        [$tenant, $admin, $sub] = $this->admin('task-filter');
        app()->instance('current_tenant_id', $tenant->id);
        Task::create(['tenant_id' => $tenant->id, 'title' => 'Call Alice', 'status' => 'open', 'priority' => 'high']);
        Task::create(['tenant_id' => $tenant->id, 'title' => 'Email Bob', 'status' => 'open', 'priority' => 'low']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/tasks?' . http_build_query([
                'conditions' => json_encode([['field' => 'priority', 'operator' => 'equals', 'value' => 'high']]),
            ]));

        $resp->assertOk();
        $data = $resp->json('data');
        $this->assertCount(1, $data);
        $this->assertSame('Call Alice', $data[0]['title']);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=TaskFilterTest`
Expected: FAIL

- [ ] **Step 3: Wire the controller**

In `backend/app/Http/Controllers/TaskController.php`, in the `index` method, insert the following right after the existing `related_type`/`related_id` block (after line 35, before the `// Sort:` comment on line 37):

```php
        if ($request->filled('date_from')) {
            $query->where('created_at', '>=', $request->input('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->where('created_at', '<=', $request->input('date_to'));
        }
        if ($request->filled('conditions')) {
            $decoded = json_decode($request->input('conditions'), true);
            \App\Services\ConditionFilter::apply($query, is_array($decoded) ? $decoded : [], ['title', 'priority', 'status', 'due_at', 'assigned_to', 'created_at']);
        }
```

Note: no `$jsonColumn` argument is passed (Task has no `custom_fields` column) — any `cf_`-prefixed condition on Tasks is silently ignored by `ConditionFilter` since `$jsonColumn` defaults to `null`, matching the spec's documented gap.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=TaskFilterTest`
Expected: PASS, 1/1

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/TaskController.php backend/tests/Feature/TaskFilterTest.php
git commit -m "feat: add advanced filtering to Tasks list endpoint"
```

---

### Task 5: Wire filtering into custom record types (Records)

**Files:**
- Modify: `backend/app/Http/Controllers/RecordController.php:22-35` (`index` method)
- Test: `backend/tests/Feature/RecordFilterTest.php`

**Interfaces:**
- Consumes: `ConditionFilter::apply(...)` from Task 1, with `$allFieldsAreJson = true`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/RecordFilterTest.php`:

```php
<?php
namespace Tests\Feature;

use App\Models\CustomFieldDefinition;
use App\Models\Record;
use App\Models\RecordType;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RecordFilterTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $sub): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        return [$tenant, $admin, $sub];
    }

    public function test_filters_records_by_condition_on_data_json(): void
    {
        [$tenant, $admin, $sub] = $this->admin('record-filter');
        app()->instance('current_tenant_id', $tenant->id);
        $type = RecordType::create(['tenant_id' => $tenant->id, 'slug' => 'invoices', 'label' => 'Invoices', 'position' => 0]);
        CustomFieldDefinition::create(['tenant_id' => $tenant->id, 'entity' => 'invoices', 'name' => 'title', 'label' => 'שם', 'field_type' => 'text', 'is_system' => true, 'sort_order' => 0]);
        Record::create(['tenant_id' => $tenant->id, 'record_type_id' => $type->id, 'data' => ['title' => 'A', 'status' => 'paid']]);
        Record::create(['tenant_id' => $tenant->id, 'record_type_id' => $type->id, 'data' => ['title' => 'B', 'status' => 'unpaid']]);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->getJson("/api/record-types/{$type->id}/records?" . http_build_query([
                'conditions' => json_encode([['field' => 'status', 'operator' => 'equals', 'value' => 'paid']]),
            ]));

        $resp->assertOk();
        $this->assertCount(1, $resp->json('data.data'));
        $this->assertSame('A', $resp->json('data.data.0.data.title'));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=RecordFilterTest`
Expected: FAIL

- [ ] **Step 3: Wire the controller**

In `backend/app/Http/Controllers/RecordController.php`, replace the `index` method (lines 22-35) with:

```php
    public function index(Request $request, RecordType $recordType): JsonResponse
    {
        abort_unless($recordType->tenant_id === app('current_tenant_id'), 403);

        $query = Record::where('record_type_id', $recordType->id)->with('creator:id,name');

        if ($search = $request->query('search')) {
            $query->where('data', 'like', "%{$search}%");
        }
        if ($request->filled('date_from')) {
            $query->where('created_at', '>=', $request->input('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->where('created_at', '<=', $request->input('date_to'));
        }
        if ($request->filled('conditions')) {
            $decoded = json_decode($request->input('conditions'), true);
            \App\Services\ConditionFilter::apply($query, is_array($decoded) ? $decoded : [], [], 'data', true);
        }

        $records = $query->orderByDesc('id')->paginate(25);

        return response()->json(['success' => true, 'data' => $records]);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=RecordFilterTest`
Expected: PASS, 1/1

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && php artisan test`
Expected: PASS, all tests green (159 + the new tests from Tasks 1-5)

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Controllers/RecordController.php backend/tests/Feature/RecordFilterTest.php
git commit -m "feat: add advanced filtering to custom record type list endpoint"
```

---

### Task 6: Frontend — advanced filter UI for Contacts

**Files:**
- Modify: `frontend/src/pages/contacts/ContactsPage.jsx`

**Interfaces:**
- Consumes: `FilterPanel` from `frontend/src/pages/leads/FilterPanel.jsx` (import path crosses from `contacts/` into `leads/` — this is the existing shared component, not duplicated), `customFieldsApi.list` from `frontend/src/api/customFields.js`, `useContacts` from `frontend/src/hooks/useContacts.js` (already forwards arbitrary filter keys to the API — no hook change needed).

- [ ] **Step 1: Add imports**

At the top of `frontend/src/pages/contacts/ContactsPage.jsx`, after line 6 (`import { translations } from '../../i18n/translations'`), add:

```js
import { useQuery } from '@tanstack/react-query'
import { customFieldsApi } from '../../api/customFields'
import FilterPanel from '../leads/FilterPanel'
```

- [ ] **Step 2: Add filter state and field-definitions query**

Inside `ContactsPage`, after line 32 (`const [saving, setSaving] = useState(false)`), add:

```js
  const [showFilter, setShowFilter] = useState(false)
  const [advFilter, setAdvFilter]   = useState({ dateFrom: '', dateTo: '', conditions: [] })

  const { data: cfData } = useQuery({
    queryKey: ['custom-fields', 'contacts'],
    queryFn:  () => customFieldsApi.list('contacts').then(r => r.data.data),
    staleTime: 1000 * 60 * 5,
  })
  const FALLBACK_FILTER_FIELDS = [
    { key: 'name', label: 'שם' },
    { key: 'phone', label: 'טלפון' },
    { key: 'email', label: 'דוא"ל' },
    { key: 'company', label: 'חברה' },
    { key: 'role', label: 'תפקיד' },
    { key: 'created_at', label: 'תאריך יצירה' },
  ]
  const FILTER_FIELDS = (cfData ?? []).length
    ? cfData
        .filter(f => !f.hidden)
        .map(f => f.is_system ? { key: f.name, label: f.label } : { key: `cf_${f.name}`, label: f.label })
    : FALLBACK_FILTER_FIELDS
  const activeFilterCount = (advFilter.dateFrom || advFilter.dateTo ? 1 : 0) + advFilter.conditions.length
```

- [ ] **Step 3: Pass filter params into the list query**

Line 34 currently reads:
```js
  const { data, isLoading } = useContacts({ search })
```
Change to:
```js
  const { data, isLoading } = useContacts({
    search,
    date_from: advFilter.dateFrom || undefined,
    date_to: advFilter.dateTo || undefined,
    conditions: advFilter.conditions.length ? JSON.stringify(advFilter.conditions) : undefined,
  })
```

- [ ] **Step 4: Add the filter button + panel next to the search box**

The search box block currently reads (lines 80-84):
```jsx
      <div className="mb-4">
        <input type="text" placeholder="🔍  חיפוש לפי שם, טלפון, אימייל..."
          value={search} onChange={e => setSearch(e.target.value)}
          className={INPUT} />
      </div>
```
Replace with:
```jsx
      <div className="mb-4 flex items-center gap-2">
        <input type="text" placeholder="🔍  חיפוש לפי שם, טלפון, אימייל..."
          value={search} onChange={e => setSearch(e.target.value)}
          className={INPUT + ' flex-1'} />
        <div className="relative">
          <button onClick={() => setShowFilter(s => !s)}
            className={`border rounded-lg px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${activeFilterCount > 0 ? 'border-[#2398c2] bg-[#2398c2]/10 text-[#2398c2]' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
            סינון ▾
            {activeFilterCount > 0 && (
              <span className="bg-[#2398c2] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
          {showFilter && (
            <FilterPanel fields={FILTER_FIELDS} conditions={advFilter.conditions}
              onApply={setAdvFilter} onClose={() => setShowFilter(false)} />
          )}
        </div>
      </div>
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npx vite build`
Expected: clean build.

- [ ] **Step 6: Manual verification in browser**

Go to Contacts, click "סינון", add a condition (e.g. company equals a known value), apply, confirm the list narrows; confirm clearing the filter (נקה) restores the full list.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/contacts/ContactsPage.jsx
git commit -m "feat: add advanced filter UI to Contacts page"
```

---

### Task 7: Frontend — advanced filter UI for Clients

**Files:**
- Modify: `frontend/src/pages/clients/ClientsPage.jsx`

**Interfaces:**
- Consumes: same as Task 6 (`FilterPanel`, `customFieldsApi`).

- [ ] **Step 1: Add imports**

After line 23 (`import { useAuth } from '../../context/AuthContext'`), add:

```js
import { customFieldsApi } from '../../api/customFields'
import FilterPanel from '../leads/FilterPanel'
```

(`useQuery` is already imported on line 20 in this file.)

- [ ] **Step 2: Add filter state and field-definitions query**

After line 38 (`const [saving, setSaving] = useState(false)`), add:

```js
  const [showFilter, setShowFilter] = useState(false)
  const [advFilter, setAdvFilter]   = useState({ dateFrom: '', dateTo: '', conditions: [] })

  const { data: cfData } = useQuery({
    queryKey: ['custom-fields', 'clients'],
    queryFn:  () => customFieldsApi.list('clients').then(r => r.data.data),
    staleTime: 1000 * 60 * 5,
  })
  const FALLBACK_FILTER_FIELDS = [
    { key: 'name', label: 'שם' },
    { key: 'phone', label: 'טלפון' },
    { key: 'email', label: 'דוא"ל' },
    { key: 'company', label: 'חברה' },
    { key: 'source', label: 'מקור' },
    { key: 'assigned_to', label: 'נציג אחראי' },
    { key: 'created_at', label: 'תאריך יצירה' },
  ]
  const FILTER_FIELDS = (cfData ?? []).length
    ? cfData
        .filter(f => !f.hidden)
        .map(f => f.is_system ? { key: f.name, label: f.label } : { key: `cf_${f.name}`, label: f.label })
    : FALLBACK_FILTER_FIELDS
  const activeFilterCount = (advFilter.dateFrom || advFilter.dateTo ? 1 : 0) + advFilter.conditions.length
```

- [ ] **Step 3: Pass filter params into the list query**

Lines 40-43 currently read:
```js
  const { data, isLoading } = useQuery({
    queryKey: ['clients', search],
    queryFn:  () => clientsApi.list({ search }).then(r => r.data.data),
  })
```
Change to:
```js
  const { data, isLoading } = useQuery({
    queryKey: ['clients', search, advFilter],
    queryFn:  () => clientsApi.list({
      search,
      date_from: advFilter.dateFrom || undefined,
      date_to: advFilter.dateTo || undefined,
      conditions: advFilter.conditions.length ? JSON.stringify(advFilter.conditions) : undefined,
    }).then(r => r.data.data),
  })
```

- [ ] **Step 4: Add the filter button + panel next to the search box**

Lines 92-95 currently read:
```jsx
      <div className="mb-4">
        <input type="text" placeholder="🔍  חיפוש לפי שם, טלפון, אימייל, חברה..."
          value={search} onChange={e => setSearch(e.target.value)} className={INPUT} />
      </div>
```
Replace with:
```jsx
      <div className="mb-4 flex items-center gap-2">
        <input type="text" placeholder="🔍  חיפוש לפי שם, טלפון, אימייל, חברה..."
          value={search} onChange={e => setSearch(e.target.value)} className={INPUT + ' flex-1'} />
        <div className="relative">
          <button onClick={() => setShowFilter(s => !s)}
            className={`border rounded-lg px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${activeFilterCount > 0 ? 'border-[#2398c2] bg-[#2398c2]/10 text-[#2398c2]' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
            סינון ▾
            {activeFilterCount > 0 && (
              <span className="bg-[#2398c2] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
          {showFilter && (
            <FilterPanel fields={FILTER_FIELDS} conditions={advFilter.conditions}
              onApply={setAdvFilter} onClose={() => setShowFilter(false)} />
          )}
        </div>
      </div>
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npx vite build`
Expected: clean build.

- [ ] **Step 6: Manual verification in browser**

Go to Clients, apply a filter condition, confirm the list narrows and clearing restores it.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/clients/ClientsPage.jsx
git commit -m "feat: add advanced filter UI to Clients page"
```

---

### Task 8: Frontend — advanced filter UI for Tasks

**Files:**
- Modify: `frontend/src/pages/tasks/TasksPage.jsx`

**Interfaces:**
- Consumes: same as Task 6/7. Note: `TasksPage` has no search box today and its list query returns a plain array (no pagination envelope) — the filter panel is added as a new UI element (not replacing a search box), and the `tasks` array is still `Array.isArray(data) ? data : []`.

- [ ] **Step 1: Add imports**

After line 6 (`import { useToast } from '../../context/ToastContext'`), add:

```js
import { customFieldsApi } from '../../api/customFields'
import FilterPanel from '../leads/FilterPanel'
```

- [ ] **Step 2: Add filter state and field-definitions query**

After line 39 (`const [error, setError]   = useState('')`), add:

```js
  const [showFilter, setShowFilter] = useState(false)
  const [advFilter, setAdvFilter]   = useState({ dateFrom: '', dateTo: '', conditions: [] })

  const { data: cfData } = useQuery({
    queryKey: ['custom-fields', 'tasks'],
    queryFn:  () => customFieldsApi.list('tasks').then(r => r.data.data),
    staleTime: 1000 * 60 * 5,
  })
  const FALLBACK_FILTER_FIELDS = [
    { key: 'title', label: 'כותרת' },
    { key: 'priority', label: 'עדיפות' },
    { key: 'status', label: 'סטטוס' },
    { key: 'due_at', label: 'תאריך יעד' },
    { key: 'assigned_to', label: 'אחראי' },
    { key: 'created_at', label: 'תאריך יצירה' },
  ]
  const FILTER_FIELDS = (cfData ?? []).length
    ? cfData
        .filter(f => !f.hidden)
        .map(f => f.is_system ? { key: f.name, label: f.label } : { key: `cf_${f.name}`, label: f.label })
    : FALLBACK_FILTER_FIELDS
  const activeFilterCount = (advFilter.dateFrom || advFilter.dateTo ? 1 : 0) + advFilter.conditions.length
```

- [ ] **Step 3: Pass filter params into the list query**

Lines 41-42 (`const params = ...`) and 43-46 currently read:
```js
  const params = filter === 'all' ? {} : filter === 'overdue' ? { overdue: true } : { status: filter }

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filter],
    queryFn:  () => tasksApi.list(params).then(r => r.data.data),
  })
```
Change to:
```js
  const params = {
    ...(filter === 'all' ? {} : filter === 'overdue' ? { overdue: true } : { status: filter }),
    date_from: advFilter.dateFrom || undefined,
    date_to: advFilter.dateTo || undefined,
    conditions: advFilter.conditions.length ? JSON.stringify(advFilter.conditions) : undefined,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filter, advFilter],
    queryFn:  () => tasksApi.list(params).then(r => r.data.data),
  })
```

- [ ] **Step 4: Add the filter button + panel next to the filter tabs**

The filter-tabs block currently reads (lines 96-106):
```jsx
      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 w-fit">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === f.id ? 'bg-white dark:bg-gray-800 text-[#2398c2] shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}>
            {f.label}
          </button>
        ))}
      </div>
```
Replace with:
```jsx
      {/* Filter tabs + advanced filter */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 w-fit">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === f.id ? 'bg-white dark:bg-gray-800 text-[#2398c2] shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <button onClick={() => setShowFilter(s => !s)}
            className={`border rounded-lg px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${activeFilterCount > 0 ? 'border-[#2398c2] bg-[#2398c2]/10 text-[#2398c2]' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
            סינון ▾
            {activeFilterCount > 0 && (
              <span className="bg-[#2398c2] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
          {showFilter && (
            <FilterPanel fields={FILTER_FIELDS} conditions={advFilter.conditions}
              onApply={setAdvFilter} onClose={() => setShowFilter(false)} />
          )}
        </div>
      </div>
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npx vite build`
Expected: clean build.

- [ ] **Step 6: Manual verification in browser**

Go to Tasks, apply a filter condition (e.g. priority equals high), confirm the list narrows.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/tasks/TasksPage.jsx
git commit -m "feat: add advanced filter UI to Tasks page"
```

---

### Task 9: Frontend — advanced filter UI for custom record types (Records)

**Files:**
- Modify: `frontend/src/pages/records/RecordsPage.jsx`

**Interfaces:**
- Consumes: same `FilterPanel` component. `fields` (the record type's own `CustomFieldDefinition` rows) are already fetched in this page (`RecordsPage.jsx:46-50`) — no new field-definitions query needed here, unlike Tasks 6-8.

- [ ] **Step 1: Add import**

After line 5 (`import { useAuth } from '../../context/AuthContext'`), add:

```js
import FilterPanel from '../leads/FilterPanel'
```

- [ ] **Step 2: Add filter state**

After line 38 (`const [error, setError]   = useState('')`), add:

```js
  const [showFilter, setShowFilter] = useState(false)
  const [advFilter, setAdvFilter]   = useState({ dateFrom: '', dateTo: '', conditions: [] })
  const FILTER_FIELDS = fields.filter(f => !f.hidden).map(f => ({ key: f.name, label: f.label }))
  const activeFilterCount = (advFilter.dateFrom || advFilter.dateTo ? 1 : 0) + advFilter.conditions.length
```

Note: unlike Leads/Contacts/Clients, record-type fields are NOT `cf_`-prefixed here — every field on a custom record type lives directly in `data`, matching `RecordController::index`'s `$allFieldsAreJson = true` mode from Task 5 (the field's own `name`, no prefix).

- [ ] **Step 3: Pass filter params into the list query**

Lines 53-57 currently read:
```js
  const { data, isLoading } = useQuery({
    queryKey: ['records', slug, search],
    queryFn:  () => recordsApi.list(type.id, { search }).then(r => r.data.data),
    enabled: !!type,
  })
```
Change to:
```js
  const { data, isLoading } = useQuery({
    queryKey: ['records', slug, search, advFilter],
    queryFn:  () => recordsApi.list(type.id, {
      search,
      date_from: advFilter.dateFrom || undefined,
      date_to: advFilter.dateTo || undefined,
      conditions: advFilter.conditions.length ? JSON.stringify(advFilter.conditions) : undefined,
    }).then(r => r.data.data),
    enabled: !!type,
  })
```

- [ ] **Step 4: Add the filter button + panel next to the search box**

Lines 136-140 currently read:
```jsx
      <div className="mb-4">
        <input type="text" placeholder="🔍  חיפוש..."
          value={search} onChange={e => setSearch(e.target.value)}
          className={INPUT + ' max-w-[320px]'} />
      </div>
```
Replace with:
```jsx
      <div className="mb-4 flex items-center gap-2">
        <input type="text" placeholder="🔍  חיפוש..."
          value={search} onChange={e => setSearch(e.target.value)}
          className={INPUT + ' max-w-[320px]'} />
        <div className="relative">
          <button onClick={() => setShowFilter(s => !s)}
            className={`border rounded-lg px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${activeFilterCount > 0 ? 'border-[#2398c2] bg-[#2398c2]/10 text-[#2398c2]' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>
            סינון ▾
            {activeFilterCount > 0 && (
              <span className="bg-[#2398c2] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
          {showFilter && (
            <FilterPanel fields={FILTER_FIELDS} conditions={advFilter.conditions}
              onApply={setAdvFilter} onClose={() => setShowFilter(false)} />
          )}
        </div>
      </div>
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npx vite build`
Expected: clean build.

- [ ] **Step 6: Manual verification in browser**

Go to any custom record type page, apply a filter condition on one of its fields, confirm the list narrows.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/records/RecordsPage.jsx
git commit -m "feat: add advanced filter UI to custom record type pages"
```

---

## Final check (after all tasks)

- [ ] Run `cd backend && php artisan test` — full suite passes (159 pre-existing + 1 ConditionFilterTest suite + 4 per-entity filter tests).
- [ ] Run `cd frontend && npx vite build` — clean build.
- [ ] Manually verify all five pages (Leads, Contacts, Clients, Tasks, one custom record type) still show correct data with no filter applied, confirming nothing broke the default (unfiltered) view.
