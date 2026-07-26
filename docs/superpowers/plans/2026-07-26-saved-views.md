# Saved Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user save a named filter+search(+columns, Leads-only) preset per entity (Leads/Contacts/Clients/Tasks/Records), select it, mark one as default per entity so it auto-applies on page load, all persisted server-side per-user.

**Architecture:** One new table `saved_views` (tenant + user scoped), one `SavedViewController` (plain CRUD + a `set-default` action), one generic `SavedViewsBar.jsx` frontend component rendered in two layouts (`dropdown` for Contacts/Clients/Tasks/Records, `sidebar` for Leads — replacing its existing hardcoded, non-editable "תצוגות" sidebar), backed by a `useSavedViews` react-query hook and a pure `isViewDirty` diff function.

**Tech Stack:** Laravel (existing `$request->user()`/`app('current_tenant_id')` auth pattern), MySQL/SQLite (tests), React + `@tanstack/react-query`, Vitest.

## Global Constraints

- Every schema change needs a matching file in `SCHEMA_DB/` using `IF NOT EXISTS` (project CLAUDE.md rule).
- Personal views only — scoped to `(tenant_id, user_id, entity_type, entity_key)`, no tenant-sharing.
- No changes to the five existing list endpoints' filtering logic — saved views only supply values for their existing `date_from`/`date_to`/`conditions`/`search` params.
- Spec: `docs/superpowers/specs/2026-07-26-saved-views-design.md`.

---

## File Structure

**Backend (new):**
- `SCHEMA_DB/2026_07_26_000002_create_saved_views_table.sql`
- `backend/database/migrations/2026_07_26_000002_create_saved_views_table.php`
- `backend/app/Models/SavedView.php`
- `backend/app/Http/Controllers/SavedViewController.php`
- `backend/tests/Feature/SavedViewTest.php`

**Backend (modify):**
- `backend/routes/api.php` — add import + 5 routes

**Frontend (new):**
- `frontend/src/api/savedViews.js`
- `frontend/src/lib/savedViewsDiff.js` — pure `isViewDirty(view, currentState)`
- `frontend/src/lib/savedViewsDiff.test.js`
- `frontend/src/hooks/useSavedViews.js` — react-query hook (list + CRUD + default-apply-on-mount)
- `frontend/src/components/ui/SavedViewsBar.jsx` — generic, `layout="dropdown"|"sidebar"`

**Frontend (modify):**
- `frontend/src/pages/contacts/ContactsPage.jsx`
- `frontend/src/pages/clients/ClientsPage.jsx`
- `frontend/src/pages/tasks/TasksPage.jsx`
- `frontend/src/pages/records/RecordsPage.jsx`
- `frontend/src/pages/leads/LeadsPage.jsx` — replaces the existing hardcoded `SAVED_VIEWS`/`activeView` sidebar (confirmed with the user: replace, not add a second widget)

---

### Task 1: Migration — `saved_views` table

**Files:**
- Create: `SCHEMA_DB/2026_07_26_000002_create_saved_views_table.sql`
- Create: `backend/database/migrations/2026_07_26_000002_create_saved_views_table.php`

**Interfaces:**
- Produces: table `saved_views` with columns `id, tenant_id, user_id, entity_type, entity_key, name, search, date_from, date_to, conditions, visible_columns, is_default, created_at, updated_at`.

- [ ] **Step 1: Write the SQL migration**

```sql
-- Migration: 2026-07-26
-- Purpose: Saved Views — per-user named filter/search/column presets per entity

CREATE TABLE IF NOT EXISTS `saved_views` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `entity_type` VARCHAR(20) NOT NULL,
    `entity_key` VARCHAR(64) NULL,
    `name` VARCHAR(120) NOT NULL,
    `search` VARCHAR(255) NULL,
    `date_from` DATE NULL,
    `date_to` DATE NULL,
    `conditions` JSON NULL,
    `visible_columns` JSON NULL,
    `is_default` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    INDEX `saved_views_scope_index` (`tenant_id`, `user_id`, `entity_type`, `entity_key`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 2: Write the matching Laravel migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('saved_views')) {
            Schema::create('saved_views', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('entity_type', 20);
                $table->string('entity_key', 64)->nullable();
                $table->string('name', 120);
                $table->string('search', 255)->nullable();
                $table->date('date_from')->nullable();
                $table->date('date_to')->nullable();
                $table->json('conditions')->nullable();
                $table->json('visible_columns')->nullable();
                $table->boolean('is_default')->default(false);
                $table->timestamps();
                $table->index(['tenant_id', 'user_id', 'entity_type', 'entity_key'], 'saved_views_scope_index');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('saved_views');
    }
};
```

- [ ] **Step 3: Run the migration**

Run: `cd backend && php artisan migrate`
Expected: `Migrating: 2026_07_26_000002_create_saved_views_table` then `Migrated:` — no errors. (Feature tests use `RefreshDatabase` against sqlite so this also gets exercised there; running it against the real dev DB here just confirms the SQL itself is valid.)

- [ ] **Step 4: Commit**

```bash
git add SCHEMA_DB/2026_07_26_000002_create_saved_views_table.sql backend/database/migrations/2026_07_26_000002_create_saved_views_table.php
git commit -m "feat: add saved_views table migration"
```

---

### Task 2: `SavedView` model

**Files:**
- Create: `backend/app/Models/SavedView.php`
- Test: `backend/tests/Unit/SavedViewModelTest.php`

**Interfaces:**
- Consumes: `saved_views` table from Task 1.
- Produces: `App\Models\SavedView` with `$fillable` and casts, used by Task 3's controller.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Unit;

use App\Models\SavedView;
use PHPUnit\Framework\TestCase;

class SavedViewModelTest extends TestCase
{
    public function test_casts_conditions_and_visible_columns_to_arrays(): void
    {
        $view = new SavedView();
        $view->conditions = [['field' => 'name', 'operator' => 'equals', 'value' => 'x']];
        $view->visible_columns = ['name' => true, 'phone' => false];
        $view->is_default = 1;

        $this->assertIsArray($view->conditions);
        $this->assertSame('x', $view->conditions[0]['value']);
        $this->assertIsArray($view->visible_columns);
        $this->assertTrue($view->is_default);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test tests/Unit/SavedViewModelTest.php`
Expected: FAIL — `Class "App\Models\SavedView" not found`

- [ ] **Step 3: Write the model**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SavedView extends Model
{
    protected $fillable = [
        'tenant_id', 'user_id', 'entity_type', 'entity_key', 'name',
        'search', 'date_from', 'date_to', 'conditions', 'visible_columns', 'is_default',
    ];

    protected $casts = [
        'conditions'      => 'array',
        'visible_columns' => 'array',
        'is_default'      => 'boolean',
        'date_from'       => 'date:Y-m-d',
        'date_to'         => 'date:Y-m-d',
    ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test tests/Unit/SavedViewModelTest.php`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add backend/app/Models/SavedView.php backend/tests/Unit/SavedViewModelTest.php
git commit -m "feat: add SavedView model"
```

---

### Task 3: `SavedViewController` + routes

**Files:**
- Create: `backend/app/Http/Controllers/SavedViewController.php`
- Modify: `backend/routes/api.php`

**Interfaces:**
- Consumes: `App\Models\SavedView` (Task 2), `App\Models\RecordType` (existing, for `entity_key` validation on `records`).
- Produces: routes `GET/POST /api/saved-views`, `PUT/DELETE /api/saved-views/{savedView}`, `POST /api/saved-views/{savedView}/set-default` — consumed by Task 5's frontend API client.

- [ ] **Step 1: Write the controller**

```php
<?php

namespace App\Http\Controllers;

use App\Models\RecordType;
use App\Models\SavedView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SavedViewController extends Controller
{
    private const ENTITY_TYPES = ['leads', 'contacts', 'clients', 'tasks', 'records'];

    private function validated(Request $request, int $tenantId): array
    {
        $data = $request->validate([
            'entity_type'            => 'required|in:' . implode(',', self::ENTITY_TYPES),
            'entity_key'             => 'nullable|string|max:64',
            'name'                   => 'required|string|max:120',
            'search'                 => 'nullable|string|max:255',
            'date_from'              => 'nullable|date',
            'date_to'                => 'nullable|date',
            'conditions'             => 'nullable|array',
            'conditions.*.field'     => 'required_with:conditions|string',
            'conditions.*.operator'  => 'required_with:conditions|string',
            'conditions.*.value'     => 'nullable',
            'visible_columns'        => 'nullable|array',
        ]);

        if ($data['entity_type'] === 'records') {
            abort_unless(! empty($data['entity_key']), 422, 'entity_key נדרש עבור records');
            $exists = RecordType::where('tenant_id', $tenantId)->where('slug', $data['entity_key'])->exists();
            abort_unless($exists, 422, 'סוג רשומה לא חוקי');
        } else {
            $data['entity_key'] = null;
        }

        return $data;
    }

    /** Scope a query to the same (tenant, user, entity_type, entity_key) bucket as $view. */
    private function scopeToBucket($query, SavedView $view)
    {
        $query->where('tenant_id', $view->tenant_id)
            ->where('user_id', $view->user_id)
            ->where('entity_type', $view->entity_type);

        return $view->entity_key === null
            ? $query->whereNull('entity_key')
            : $query->where('entity_key', $view->entity_key);
    }

    public function index(Request $request): JsonResponse
    {
        $tenantId   = app('current_tenant_id');
        $entityType = $request->query('entity_type');
        abort_unless(in_array($entityType, self::ENTITY_TYPES, true), 422, 'entity_type לא חוקי');
        $entityKey = $request->query('entity_key');

        $query = SavedView::where('tenant_id', $tenantId)
            ->where('user_id', $request->user()->id)
            ->where('entity_type', $entityType);

        $query = $entityKey ? $query->where('entity_key', $entityKey) : $query->whereNull('entity_key');

        return response()->json(['success' => true, 'data' => $query->orderBy('name')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = app('current_tenant_id');
        $data     = $this->validated($request, $tenantId);

        $view = SavedView::create([
            'tenant_id'  => $tenantId,
            'user_id'    => $request->user()->id,
            'is_default' => false,
            ...$data,
        ]);

        return response()->json(['success' => true, 'data' => $view], 201);
    }

    public function update(Request $request, SavedView $savedView): JsonResponse
    {
        abort_unless($savedView->tenant_id === app('current_tenant_id'), 403);
        abort_unless($savedView->user_id === $request->user()->id, 403);

        $data = $this->validated($request, $savedView->tenant_id);
        $savedView->update($data);

        return response()->json(['success' => true, 'data' => $savedView->fresh()]);
    }

    public function destroy(Request $request, SavedView $savedView): JsonResponse
    {
        abort_unless($savedView->tenant_id === app('current_tenant_id'), 403);
        abort_unless($savedView->user_id === $request->user()->id, 403);

        $savedView->delete();

        return response()->json(['success' => true, 'data' => null]);
    }

    public function setDefault(Request $request, SavedView $savedView): JsonResponse
    {
        abort_unless($savedView->tenant_id === app('current_tenant_id'), 403);
        abort_unless($savedView->user_id === $request->user()->id, 403);

        DB::transaction(function () use ($savedView) {
            $this->scopeToBucket(SavedView::query(), $savedView)
                ->where('id', '!=', $savedView->id)
                ->update(['is_default' => false]);
            $savedView->update(['is_default' => true]);
        });

        return response()->json(['success' => true, 'data' => $savedView->fresh()]);
    }
}
```

- [ ] **Step 2: Add routes**

In `backend/routes/api.php`, add the import near the other controller imports:

```php
use App\Http\Controllers\SavedViewController;
```

And add the routes inside the existing `Route::middleware(['auth:sanctum', 'tenant', 'agent.ability'])->group(...)` block, right after the Tasks routes (no `permission:` middleware — personal resource, any authenticated tenant user manages their own views):

```php
    // Saved views — personal, per-user (not tenant-shared)
    Route::get('/saved-views',                          [SavedViewController::class, 'index']);
    Route::post('/saved-views',                         [SavedViewController::class, 'store']);
    Route::put('/saved-views/{savedView}',              [SavedViewController::class, 'update']);
    Route::delete('/saved-views/{savedView}',           [SavedViewController::class, 'destroy']);
    Route::post('/saved-views/{savedView}/set-default', [SavedViewController::class, 'setDefault']);
```

- [ ] **Step 3: Verify routes are registered**

Run: `cd backend && php artisan route:list --path=saved-views`
Expected: 5 rows listing GET, POST, PUT, DELETE, POST (set-default), all under `api/saved-views...`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/Http/Controllers/SavedViewController.php backend/routes/api.php
git commit -m "feat: add SavedViewController and routes"
```

---

### Task 4: Backend feature tests

**Files:**
- Create: `backend/tests/Feature/SavedViewTest.php`

**Interfaces:**
- Consumes: `SavedViewController` (Task 3), the `admin()`-style tenant/user test helper pattern already used in `backend/tests/Feature/ContactFilterTest.php`.

- [ ] **Step 1: Write the test file**

```php
<?php

namespace Tests\Feature;

use App\Models\RecordType;
use App\Models\SavedView;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SavedViewTest extends TestCase
{
    use RefreshDatabase;

    private function tenantAndUser(string $sub): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        $user   = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        return [$tenant, $user, $sub];
    }

    public function test_creates_and_lists_a_saved_view(): void
    {
        [$tenant, $user, $sub] = $this->tenantAndUser('sv-create');
        app()->instance('current_tenant_id', $tenant->id);

        $resp = $this->actingAs($user)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/saved-views', [
                'entity_type' => 'leads',
                'name'        => 'לידים חדשים',
                'conditions'  => [['field' => 'source', 'operator' => 'equals', 'value' => 'אתר']],
            ]);
        $resp->assertCreated();

        $list = $this->actingAs($user)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/saved-views?entity_type=leads');
        $list->assertOk();
        $this->assertCount(1, $list->json('data'));
        $this->assertSame('לידים חדשים', $list->json('data.0.name'));
    }

    public function test_list_only_returns_the_requesting_users_views(): void
    {
        [$tenant, $userA, $sub] = $this->tenantAndUser('sv-scope');
        $userB = User::create(['tenant_id' => $tenant->id, 'name' => 'B', 'email' => "b@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        app()->instance('current_tenant_id', $tenant->id);

        SavedView::create(['tenant_id' => $tenant->id, 'user_id' => $userA->id, 'entity_type' => 'leads', 'name' => 'A view']);
        SavedView::create(['tenant_id' => $tenant->id, 'user_id' => $userB->id, 'entity_type' => 'leads', 'name' => 'B view']);

        $resp = $this->actingAs($userA)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/saved-views?entity_type=leads');
        $resp->assertOk();
        $this->assertCount(1, $resp->json('data'));
        $this->assertSame('A view', $resp->json('data.0.name'));
    }

    public function test_user_cannot_update_or_delete_another_users_view(): void
    {
        [$tenant, $userA, $sub] = $this->tenantAndUser('sv-owner');
        $userB = User::create(['tenant_id' => $tenant->id, 'name' => 'B', 'email' => "b@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        app()->instance('current_tenant_id', $tenant->id);

        $view = SavedView::create(['tenant_id' => $tenant->id, 'user_id' => $userA->id, 'entity_type' => 'leads', 'name' => 'A view']);

        $this->actingAs($userB)->withHeaders(['X-Tenant' => $sub])
            ->putJson("/api/saved-views/{$view->id}", ['entity_type' => 'leads', 'name' => 'hijacked'])
            ->assertForbidden();

        $this->actingAs($userB)->withHeaders(['X-Tenant' => $sub])
            ->deleteJson("/api/saved-views/{$view->id}")
            ->assertForbidden();
    }

    public function test_set_default_unsets_the_previous_default_in_the_same_bucket(): void
    {
        [$tenant, $user, $sub] = $this->tenantAndUser('sv-default');
        app()->instance('current_tenant_id', $tenant->id);

        $viewA = SavedView::create(['tenant_id' => $tenant->id, 'user_id' => $user->id, 'entity_type' => 'leads', 'name' => 'A', 'is_default' => true]);
        $viewB = SavedView::create(['tenant_id' => $tenant->id, 'user_id' => $user->id, 'entity_type' => 'leads', 'name' => 'B']);

        $this->actingAs($user)->withHeaders(['X-Tenant' => $sub])
            ->postJson("/api/saved-views/{$viewB->id}/set-default")
            ->assertOk();

        $this->assertFalse($viewA->fresh()->is_default);
        $this->assertTrue($viewB->fresh()->is_default);
    }

    public function test_records_entity_requires_a_valid_entity_key(): void
    {
        [$tenant, $user, $sub] = $this->tenantAndUser('sv-records');
        app()->instance('current_tenant_id', $tenant->id);
        RecordType::create(['tenant_id' => $tenant->id, 'slug' => 'invoices', 'label' => 'חשבוניות', 'position' => 0]);

        $this->actingAs($user)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/saved-views', ['entity_type' => 'records', 'name' => 'no key'])
            ->assertStatus(422);

        $this->actingAs($user)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/saved-views', ['entity_type' => 'records', 'entity_key' => 'invoices', 'name' => 'ok'])
            ->assertCreated();

        $this->actingAs($user)->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/saved-views', ['entity_type' => 'records', 'entity_key' => 'does-not-exist', 'name' => 'bad'])
            ->assertStatus(422);
    }
}
```

- [ ] **Step 2: Run the tests**

Run: `cd backend && php artisan test tests/Feature/SavedViewTest.php`
Expected: PASS (5 tests). If `test_user_cannot_update_or_delete_another_users_view` fails with a 404 instead of 403 (Laravel implicit route-model binding 404s before the tenant/user check ever runs when the id genuinely doesn't resolve — not the case here since the view does exist and does belong to the same tenant, so this should hit the `abort_unless` and return 403 as written) diagnose against the actual response body rather than assuming — do not weaken the assertion.

- [ ] **Step 3: Run the full backend suite to confirm no regressions**

Run: `cd backend && php artisan test`
Expected: all tests pass (170 prior + 1 model test + 5 feature tests = 176).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/Feature/SavedViewTest.php
git commit -m "test: add SavedView feature tests"
```

---

### Task 5: Frontend API client

**Files:**
- Create: `frontend/src/api/savedViews.js`

**Interfaces:**
- Consumes: `frontend/src/api/client.js` (existing axios instance).
- Produces: `savedViewsApi.{list,create,update,remove,setDefault}` — consumed by Task 7's hook.

- [ ] **Step 1: Write the file**

```js
import client from './client'

export const savedViewsApi = {
  list:       (entityType, entityKey) => client.get('/saved-views', { params: { entity_type: entityType, entity_key: entityKey || undefined } }),
  create:     (data) => client.post('/saved-views', data),
  update:     (id, data) => client.put(`/saved-views/${id}`, data),
  remove:     (id) => client.delete(`/saved-views/${id}`),
  setDefault: (id) => client.post(`/saved-views/${id}/set-default`),
}
```

- [ ] **Step 2: Sanity-check it builds**

Run: `cd frontend && npx vite build`
Expected: clean build, no import errors (nothing consumes this file yet, so this only proves the syntax is valid).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/savedViews.js
git commit -m "feat: add savedViews API client"
```

---

### Task 6: Pure dirty-state diff module

**Files:**
- Create: `frontend/src/lib/savedViewsDiff.js`
- Create: `frontend/src/lib/savedViewsDiff.test.js`

**Interfaces:**
- Produces: `isViewDirty(view, currentState)` where `view` is a saved-view API object (`{search, date_from, date_to, conditions, visible_columns}` or `null`) and `currentState` is `{search, dateFrom, dateTo, conditions, visibleColumns}`. Returns `false` when `view` is `null` (no active view = never dirty). Consumed by Task 8 (`SavedViewsBar`).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest'
import { isViewDirty } from './savedViewsDiff'

const baseView = {
  search: 'abc', date_from: '', date_to: '',
  conditions: [{ field: 'name', operator: 'equals', value: 'x' }],
  visible_columns: null,
}

describe('isViewDirty', () => {
  it('is never dirty when no view is active', () => {
    expect(isViewDirty(null, { search: '', dateFrom: '', dateTo: '', conditions: [] })).toBe(false)
  })

  it('is not dirty when current state matches the view exactly', () => {
    const current = { search: 'abc', dateFrom: '', dateTo: '', conditions: baseView.conditions }
    expect(isViewDirty(baseView, current)).toBe(false)
  })

  it('is dirty when search diverges', () => {
    const current = { search: 'changed', dateFrom: '', dateTo: '', conditions: baseView.conditions }
    expect(isViewDirty(baseView, current)).toBe(true)
  })

  it('is dirty when conditions diverge', () => {
    const current = { search: 'abc', dateFrom: '', dateTo: '', conditions: [] }
    expect(isViewDirty(baseView, current)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/savedViewsDiff.test.js`
Expected: FAIL — `Failed to resolve import "./savedViewsDiff"`

- [ ] **Step 3: Write the implementation**

```js
function normalize(state) {
  return {
    search: state.search || '',
    dateFrom: state.dateFrom || '',
    dateTo: state.dateTo || '',
    conditions: state.conditions ?? [],
    visibleColumns: state.visibleColumns ?? null,
  }
}

export function isViewDirty(view, currentState) {
  if (!view) return false

  const stored = normalize({
    search: view.search,
    dateFrom: view.date_from,
    dateTo: view.date_to,
    conditions: view.conditions,
    visibleColumns: view.visible_columns,
  })
  const current = normalize(currentState)

  return JSON.stringify(stored) !== JSON.stringify(current)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/savedViewsDiff.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/savedViewsDiff.js frontend/src/lib/savedViewsDiff.test.js
git commit -m "feat: add isViewDirty saved-view diff helper"
```

---

### Task 7: `useSavedViews` hook

**Files:**
- Create: `frontend/src/hooks/useSavedViews.js`

**Interfaces:**
- Consumes: `savedViewsApi` (Task 5).
- Produces: `useSavedViews(entityType, entityKey, onApplyDefault)` returning `{ views, isLoading, create, update, remove, setDefault }` where `create`/`update`/`remove`/`setDefault` are react-query mutation objects (`.mutate(...)`). `onApplyDefault` is called once, at most, with the default view object when the list first loads and a default exists. Consumed by Task 8 (`SavedViewsBar`).

- [ ] **Step 1: Write the hook**

```js
import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { savedViewsApi } from '../api/savedViews'

export function useSavedViews(entityType, entityKey, onApplyDefault) {
  const qc = useQueryClient()
  const queryKey = ['saved-views', entityType, entityKey ?? null]
  const appliedDefault = useRef(false)

  const query = useQuery({
    queryKey,
    queryFn: () => savedViewsApi.list(entityType, entityKey).then(r => r.data.data),
  })

  useEffect(() => {
    if (appliedDefault.current || !query.data) return
    appliedDefault.current = true
    const def = query.data.find(v => v.is_default)
    if (def) onApplyDefault(def)
  }, [query.data, onApplyDefault])

  const create = useMutation({
    mutationFn: (data) => savedViewsApi.create({ entity_type: entityType, entity_key: entityKey, ...data }).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  const update = useMutation({
    mutationFn: ({ id, data }) => savedViewsApi.update(id, { entity_type: entityType, entity_key: entityKey, ...data }).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  const remove = useMutation({
    mutationFn: (id) => savedViewsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  const setDefault = useMutation({
    mutationFn: (id) => savedViewsApi.setDefault(id).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  return { views: query.data ?? [], isLoading: query.isLoading, create, update, remove, setDefault }
}
```

Note for whoever wires this into a page (Tasks 9–13): `onApplyDefault` must be a stable reference (wrap it in `useCallback` at the call site) — passing an inline arrow function would re-run the effect's dependency check every render, though `appliedDefault.current` still guards against re-applying, so this is a lint/clarity concern, not a correctness bug. Wrap it anyway to keep `react-hooks/exhaustive-deps` clean, matching the rest of this codebase's hook style.

- [ ] **Step 2: Verify it builds (no consumer yet, syntax check only)**

Run: `cd frontend && npx vite build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useSavedViews.js
git commit -m "feat: add useSavedViews hook"
```

---

### Task 8: `SavedViewsBar` component

**Files:**
- Create: `frontend/src/components/ui/SavedViewsBar.jsx`

**Interfaces:**
- Consumes: `useSavedViews` (Task 7), `isViewDirty` (Task 6).
- Produces: `<SavedViewsBar layout entityType entityKey currentState onApply />`.
  - `layout`: `'dropdown'` (default) or `'sidebar'`.
  - `currentState`: `{ search, dateFrom, dateTo, conditions, visibleColumns }` — `search`/`visibleColumns` may be `undefined` on pages that don't have those (Tasks has no search box; only Leads has columns).
  - `onApply(patch)`: called with `{ search, dateFrom, dateTo, conditions, visibleColumns }` both when the user picks a view (or "הכל"/All) and when a default view auto-applies on mount. The caller is responsible for feeding each field into its own existing state setters, and must ignore `patch.search`/`patch.visibleColumns` if that page has no such state.
- Consumed by Tasks 9–13.

- [ ] **Step 1: Write the component**

```jsx
import { useCallback, useState } from 'react'
import { useSavedViews } from '../../hooks/useSavedViews'
import { isViewDirty } from '../../lib/savedViewsDiff'

const viewToPatch = (view) => ({
  search: view.search || '',
  dateFrom: view.date_from || '',
  dateTo: view.date_to || '',
  conditions: view.conditions ?? [],
  visibleColumns: view.visible_columns ?? null,
})

const EMPTY_PATCH = { search: '', dateFrom: '', dateTo: '', conditions: [], visibleColumns: null }

export default function SavedViewsBar({ layout = 'dropdown', entityType, entityKey, currentState, onApply }) {
  const [activeViewId, setActiveViewId] = useState(null)
  const [open, setOpen] = useState(false)
  const [saveModal, setSaveModal] = useState(false)
  const [nameInput, setNameInput] = useState('')

  const onApplyDefault = useCallback((view) => {
    setActiveViewId(view.id)
    onApply(viewToPatch(view))
  }, [onApply])

  const { views, create, update, remove, setDefault } = useSavedViews(entityType, entityKey, onApplyDefault)

  const activeView = views.find(v => v.id === activeViewId) ?? null
  const dirty = isViewDirty(activeView, currentState)

  const selectView = (view) => {
    setActiveViewId(view ? view.id : null)
    onApply(view ? viewToPatch(view) : EMPTY_PATCH)
    setOpen(false)
  }

  const currentAsPayload = (name) => ({
    name,
    search: currentState.search || null,
    date_from: currentState.dateFrom || null,
    date_to: currentState.dateTo || null,
    conditions: currentState.conditions ?? [],
    visible_columns: currentState.visibleColumns ?? null,
  })

  const saveCurrentAsNew = () => {
    if (!nameInput.trim()) return
    create.mutate(currentAsPayload(nameInput.trim()), {
      onSuccess: (view) => { setActiveViewId(view.id); setSaveModal(false); setNameInput('') },
    })
  }

  const updateActiveView = () => {
    if (!activeView) return
    update.mutate({ id: activeView.id, data: currentAsPayload(activeView.name) })
  }

  const deleteActiveView = () => {
    if (!activeView) return
    remove.mutate(activeView.id)
    selectView(null)
  }

  const rowClass = (isActive) =>
    `w-full text-right px-4 py-2 text-sm transition-colors ${isActive ? 'bg-[#2398c2]/10 text-[#2398c2] font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`

  const rows = (
    <>
      <button type="button" onClick={() => selectView(null)} className={rowClass(!activeViewId)}>הכל</button>
      {views.map(v => (
        <button key={v.id} type="button" onClick={() => selectView(v)} className={rowClass(activeViewId === v.id)}>
          {v.name}{v.is_default ? ' ★' : ''}
        </button>
      ))}
      <button type="button" onClick={() => setSaveModal(true)} className="w-full text-right px-4 py-2 text-sm text-[#2398c2] hover:underline">
        + הוסף תצוגה
      </button>
    </>
  )

  const activeControls = activeView && (
    <div className="flex items-center gap-2 px-2 py-1.5 text-xs flex-wrap">
      <span className="text-gray-500 dark:text-gray-400">{activeView.name}{dirty ? ' (שונה, לא נשמר)' : ''}</span>
      {dirty && <button type="button" onClick={updateActiveView} className="text-[#2398c2] hover:underline">עדכן תצוגה</button>}
      {!activeView.is_default && <button type="button" onClick={() => setDefault.mutate(activeView.id)} className="text-gray-400 hover:text-gray-600">קבע כברירת מחדל</button>}
      <button type="button" onClick={deleteActiveView} className="text-red-400 hover:text-red-600">מחק</button>
    </div>
  )

  const saveModalUi = saveModal && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={() => setSaveModal(false)}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">שמירת תצוגה חדשה</h3>
        <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="שם התצוגה..."
          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-4" />
        <div className="flex gap-2">
          <button type="button" onClick={saveCurrentAsNew} className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] text-white py-2 rounded-lg text-sm font-medium">שמור</button>
          <button type="button" onClick={() => setSaveModal(false)} className="px-3 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">ביטול</button>
        </div>
      </div>
    </div>
  )

  if (layout === 'sidebar') {
    return (
      <>
        <nav className="py-1">{rows}</nav>
        {activeControls}
        {saveModalUi}
      </>
    )
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition-colors">
        {activeView ? activeView.name : 'תצוגות'} ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 w-56">
          {rows}
        </div>
      )}
      {activeControls}
      {saveModalUi}
    </div>
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd frontend && npx vite build`
Expected: clean build (still no consumer, syntax/import check only).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/SavedViewsBar.jsx
git commit -m "feat: add SavedViewsBar component"
```

---

### Task 9: Wire into ContactsPage

**Files:**
- Modify: `frontend/src/pages/contacts/ContactsPage.jsx`

**Interfaces:**
- Consumes: `SavedViewsBar` (Task 8), existing page state `search`/`setSearch` (line 33), `advFilter`/`setAdvFilter` (line 39).

- [ ] **Step 1: Add the import**

Near the existing `import FilterPanel from '../leads/FilterPanel'` line, add:

```js
import SavedViewsBar from '../../components/ui/SavedViewsBar'
```

- [ ] **Step 2: Render it next to the filter button**

Find this block (currently around line 118–130):

```jsx
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
```

Add a `<SavedViewsBar>` right after this closing `</div>`, still inside the same `mb-4 flex items-center gap-2` container:

```jsx
        <SavedViewsBar entityType="contacts"
          currentState={{ search, dateFrom: advFilter.dateFrom, dateTo: advFilter.dateTo, conditions: advFilter.conditions }}
          onApply={(patch) => {
            setSearch(patch.search)
            setAdvFilter({ dateFrom: patch.dateFrom, dateTo: patch.dateTo, conditions: patch.conditions })
          }} />
```

- [ ] **Step 3: Manually verify in the browser**

Run the dev server (`cd frontend && npm run dev`), open Contacts, confirm: the "תצוגות" button renders, clicking "+ הוסף תצוגה" while a search term + a filter condition are active saves a view, selecting it later restores that search+filter, and "הכל" clears both.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/contacts/ContactsPage.jsx
git commit -m "feat: wire SavedViewsBar into ContactsPage"
```

---

### Task 10: Wire into ClientsPage

**Files:**
- Modify: `frontend/src/pages/clients/ClientsPage.jsx`

**Interfaces:**
- Consumes: `SavedViewsBar` (Task 8), existing `search`/`setSearch` (line 38), `advFilter`/`setAdvFilter` (line 45).

- [ ] **Step 1: Add the import**

```js
import SavedViewsBar from '../../components/ui/SavedViewsBar'
```

- [ ] **Step 2: Render it next to the filter button**

Same shape as Task 9 — find the `<FilterPanel ...>` block (around line 140) and add immediately after its wrapping `<div className="relative">...</div>`:

```jsx
        <SavedViewsBar entityType="clients"
          currentState={{ search, dateFrom: advFilter.dateFrom, dateTo: advFilter.dateTo, conditions: advFilter.conditions }}
          onApply={(patch) => {
            setSearch(patch.search)
            setAdvFilter({ dateFrom: patch.dateFrom, dateTo: patch.dateTo, conditions: patch.conditions })
          }} />
```

- [ ] **Step 3: Manually verify in the browser**

Open Clients, repeat the same save/select/clear check as Task 9.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/clients/ClientsPage.jsx
git commit -m "feat: wire SavedViewsBar into ClientsPage"
```

---

### Task 11: Wire into TasksPage

**Files:**
- Modify: `frontend/src/pages/tasks/TasksPage.jsx`

**Interfaces:**
- Consumes: `SavedViewsBar` (Task 8), existing `advFilter`/`setAdvFilter` (line 46). **TasksPage has no free-text search state at all** (only an open/done `filter` toggle, unrelated to this feature) — `currentState.search` is omitted, and `onApply`'s `patch.search` is ignored.

- [ ] **Step 1: Add the import**

```js
import SavedViewsBar from '../../components/ui/SavedViewsBar'
```

- [ ] **Step 2: Render it next to the filter button**

Find the `<FilterPanel ...>` block (around line 157) and add immediately after its wrapping element:

```jsx
        <SavedViewsBar entityType="tasks"
          currentState={{ dateFrom: advFilter.dateFrom, dateTo: advFilter.dateTo, conditions: advFilter.conditions }}
          onApply={(patch) => {
            setAdvFilter({ dateFrom: patch.dateFrom, dateTo: patch.dateTo, conditions: patch.conditions })
          }} />
```

- [ ] **Step 3: Manually verify in the browser**

Open Tasks, save a view with a filter condition active, confirm selecting it restores the filter (no search box to check here).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/tasks/TasksPage.jsx
git commit -m "feat: wire SavedViewsBar into TasksPage"
```

---

### Task 12: Wire into RecordsPage

**Files:**
- Modify: `frontend/src/pages/records/RecordsPage.jsx`

**Interfaces:**
- Consumes: `SavedViewsBar` (Task 8), existing `search`/`setSearch` (line 37), `advFilter`/`setAdvFilter` (line 43), `slug` from `useParams()` (line 30) — passed as `entityKey`.

- [ ] **Step 1: Add the import**

```js
import SavedViewsBar from '../../components/ui/SavedViewsBar'
```

- [ ] **Step 2: Render it next to the filter button**

Find the `<FilterPanel ...>` block (around line 164) and add immediately after its wrapping element:

```jsx
        <SavedViewsBar entityType="records" entityKey={slug}
          currentState={{ search, dateFrom: advFilter.dateFrom, dateTo: advFilter.dateTo, conditions: advFilter.conditions }}
          onApply={(patch) => {
            setSearch(patch.search)
            setAdvFilter({ dateFrom: patch.dateFrom, dateTo: patch.dateTo, conditions: patch.conditions })
          }} />
```

- [ ] **Step 3: Manually verify in the browser**

Open a custom record type's page (e.g. "חשבוניות" from a prior session's testing, if still seeded), save a view, switch to a *different* record type and confirm its saved-views list is separate (per-slug scoping via `entityKey`), then switch back and confirm the first one is still there.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/records/RecordsPage.jsx
git commit -m "feat: wire SavedViewsBar into RecordsPage"
```

---

### Task 13: Wire into LeadsPage — replace the hardcoded sidebar

**Files:**
- Modify: `frontend/src/pages/leads/LeadsPage.jsx`

**Interfaces:**
- Consumes: `SavedViewsBar` (Task 8, `layout="sidebar"`), existing `search`/`setSearch` (line 117), `advFilter`/`setAdvFilter` (~line 178 area, same shape as other pages), `visibleCols`/`setVisCols` (line 131).
- Removes: the `SAVED_VIEWS` const (lines 71–74), the `activeView`/`setView` state (line 128), the `viewFilter` derived value and its two filter checks (lines 182, 237–238), and the hardcoded `<aside>` sidebar markup (lines 577–590) — **confirmed with the user**: this replaces the existing non-editable 2-item sidebar rather than adding a second, separate saved-views UI.

- [ ] **Step 1: Add the import**

Near the other page imports:

```js
import SavedViewsBar from '../../components/ui/SavedViewsBar'
```

- [ ] **Step 2: Remove the hardcoded `SAVED_VIEWS` constant**

Delete:

```js
const SAVED_VIEWS = [
  { id: 'all',      label: 'כל הלידים', filter: {} },
  { id: 'no_agent', label: 'ללא נציג',  filter: { no_agent: true } },
]
```

- [ ] **Step 3: Remove the `activeView` state and `viewFilter` derivation**

Delete the state line:

```js
  const [activeView, setView]     = useState('all')
```

Delete the derived line:

```js
  const viewFilter = SAVED_VIEWS.find(v => v.id === activeView)?.filter ?? {}
```

- [ ] **Step 4: Remove the client-side `viewFilter` post-filtering**

Find:

```js
  const allLeads = data?.data ?? []
  const leads = allLeads.filter(l => {
    if (viewFilter.status && l.status !== viewFilter.status) return false
    if (viewFilter.no_agent && l.assigned_to != null) return false
    return true
  })
```

Replace with (the hardcoded "ללא נציג" quick-filter is retired — a user who wants it back can recreate it as a real saved view, `{field: 'assigned_to', operator: 'empty'}`, which now persists and is shareable-by-name instead of being a fixed, uneditable option):

```js
  const leads = data?.data ?? []
```

- [ ] **Step 5: Update the `setPage` reset effect**

Find:

```js
  useEffect(() => { setPage(1) }, [search, stageFilter, activeView, advFilter])
```

Replace with:

```js
  useEffect(() => { setPage(1) }, [search, stageFilter, advFilter])
```

- [ ] **Step 6: Replace the hardcoded sidebar with `SavedViewsBar`**

Find:

```jsx
      {/* Right sidebar — saved views */}
      <aside className="w-44 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">תצוגות</span>
        </div>
        <nav className="py-1">
          {SAVED_VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`w-full text-right px-4 py-2 text-sm transition-colors ${activeView === v.id ? 'bg-[#2398c2]/10 text-[#2398c2] font-medium' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              {v.label}
            </button>
          ))}
        </nav>
      </aside>
```

Replace with:

```jsx
      {/* Right sidebar — saved views */}
      <aside className="w-44 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">תצוגות</span>
        </div>
        <SavedViewsBar layout="sidebar" entityType="leads"
          currentState={{ search, dateFrom: advFilter.dateFrom, dateTo: advFilter.dateTo, conditions: advFilter.conditions, visibleColumns: visibleCols }}
          onApply={(patch) => {
            setSearch(patch.search)
            setAdvFilter({ dateFrom: patch.dateFrom, dateTo: patch.dateTo, conditions: patch.conditions })
            if (patch.visibleColumns) setVisCols(patch.visibleColumns)
          }} />
      </aside>
```

- [ ] **Step 7: Fix the empty-state message that referenced `activeView`**

Find (around line 749):

```jsx
                    <div>אין {t('leads')} {activeView !== 'all' ? 'בתצוגה זו' : 'עדיין'}</div>
```

Replace with:

```jsx
                    <div>אין {t('leads')} {(search || advFilter.dateFrom || advFilter.dateTo || advFilter.conditions.length) ? 'בסינון זה' : 'עדיין'}</div>
```

- [ ] **Step 8: Run the frontend build and existing test suite**

Run: `cd frontend && npx vite build && npx vitest run`
Expected: clean build, all existing tests still pass (no test referenced `SAVED_VIEWS`/`activeView` directly — confirm with `grep -r "SAVED_VIEWS\|activeView" frontend/src` returning no remaining references before moving on).

- [ ] **Step 9: Manually verify in the browser**

Open Leads: confirm the sidebar now shows "הכל" plus any saved views, "+ הוסף תצוגה" works, selecting a view restores search/filter/visible-columns, and the old "ללא נציג" quick option is gone (expected — recreate it as a real saved view with an `empty` condition on `assigned_to` if wanted back).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/leads/LeadsPage.jsx
git commit -m "feat: replace hardcoded leads views sidebar with SavedViewsBar"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1–2), backend API + ownership + default-uniqueness transaction (Task 3), backend tests including cross-user denial and the records `entity_key` validation (Task 4), frontend API client (Task 5), dirty-state diff (Task 6), hook with default-on-mount (Task 7), generic dual-layout component (Task 8), all five pages wired (Tasks 9–13, with the Leads-specific sidebar replacement called out explicitly per the user's confirmed decision). Every section of `docs/superpowers/specs/2026-07-26-saved-views-design.md` maps to a task.
- **Placeholder scan:** no TBD/TODO; every step has real, complete code.
- **Type consistency:** `visible_columns` (snake_case, API/DB) vs `visibleColumns` (camelCase, JS state) is intentional and consistent throughout — matches the existing codebase convention of snake_case over the wire, camelCase in React state (e.g. `date_from`/`dateFrom` in `FilterPanel`'s own `onApply` payload). `SavedViewsBar`'s `onApply(patch)` shape (`{search, dateFrom, dateTo, conditions, visibleColumns}`) is identical across all five wiring tasks.
