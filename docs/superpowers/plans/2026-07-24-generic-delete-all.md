# Generic "Delete All" Bulk Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the leads-only "Delete All" feature with one generic, tenant-scoped endpoint and one shared React modal/hook that work across leads, contacts, clients, tasks, and every custom record type.

**Architecture:** One new backend route `DELETE /api/entities/{entity}/all` → `BulkDeleteController::destroyAll`, resolving either a hardcoded entity (leads/contacts/clients/tasks) or a `RecordType` slug, soft-deleting via each model's existing tenant scope. One new frontend `DeleteAllModal` component + `useDeleteAllEntity(entity)` hook, wired into the five list pages, replacing leads' existing `window.prompt`-based flow.

**Tech Stack:** Laravel 10 (PHP), PHPUnit feature tests, React + TanStack Query, Tailwind.

## Global Constraints

- Soft delete only (`SoftDeletes` on all five affected models) — never `forceDelete`.
- Permission per entity must exactly match that entity's existing single-delete route permission (see table in the spec) — do not invent new permission modules.
- Confirmation requires typing the Hebrew word "מחק" in a real modal component, not `window.prompt`.
- Button sits near the pagination area / table footer, not the page header.
- Spec: `docs/superpowers/specs/2026-07-24-generic-delete-all-design.md`

---

### Task 1: Backend — `BulkDeleteController` + route + tests

**Files:**
- Create: `backend/app/Http/Controllers/BulkDeleteController.php`
- Modify: `backend/routes/api.php` — remove lines 78-79 (`/leads/all/clear` route), add new generic route inside the existing `auth:sanctum,tenant,agent.ability` group (near the record-types routes, after line 258)
- Modify: `backend/app/Http/Controllers/LeadController.php` — remove the `deleteAll` method (lines 39-52)
- Modify: `backend/tests/Feature/BulkLeadActionTest.php` — update the two existing `/api/leads/all/clear` tests (lines ~90-113) to hit the new route
- Create: `backend/tests/Feature/BulkDeleteControllerTest.php`

**Interfaces:**
- Produces: `DELETE /api/entities/{entity}/all` → JSON `{success: true, data: {deleted: <int>}}` on success, `403` on missing permission, `404` if `{entity}` is neither a known hardcoded key nor an existing `RecordType` slug for the current tenant.

- [ ] **Step 1: Write the failing tests**

Update the two existing leads tests in `backend/tests/Feature/BulkLeadActionTest.php` to point at the new route (find-and-replace `'/api/leads/all/clear'` → `'/api/entities/leads/all'` on both `deleteJson(...)` calls at lines 91 and 108). No other change needed in that file.

Create `backend/tests/Feature/BulkDeleteControllerTest.php`:

```php
<?php
namespace Tests\Feature;

use App\Models\Client;
use App\Models\Contact;
use App\Models\CustomFieldDefinition;
use App\Models\Lead;
use App\Models\Record;
use App\Models\RecordType;
use App\Models\Task;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class BulkDeleteControllerTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenant(string $sub): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        return [$tenant, $admin, $sub];
    }

    public function test_delete_all_contacts(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('bda-contacts');
        Contact::create(['tenant_id' => $tenant->id, 'name' => 'A']);
        Contact::create(['tenant_id' => $tenant->id, 'name' => 'B']);
        $other = Tenant::create(['name' => 'O', 'subdomain' => 'bda-contacts-o', 'status' => 'active']);
        Contact::create(['tenant_id' => $other->id, 'name' => 'Foreign']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->deleteJson('/api/entities/contacts/all');

        $resp->assertOk();
        $this->assertSame(2, $resp->json('data.deleted'));
        app()->instance('current_tenant_id', $tenant->id);
        $this->assertSame(0, Contact::count());
        app()->instance('current_tenant_id', $other->id);
        $this->assertSame(1, Contact::count()); // foreign untouched
    }

    public function test_delete_all_clients(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('bda-clients');
        Client::create(['tenant_id' => $tenant->id, 'name' => 'A']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->deleteJson('/api/entities/clients/all');

        $resp->assertOk();
        $this->assertSame(1, $resp->json('data.deleted'));
        app()->instance('current_tenant_id', $tenant->id);
        $this->assertSame(0, Client::count());
    }

    public function test_delete_all_tasks_uses_can_update_permission(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('bda-tasks');
        Task::create(['tenant_id' => $tenant->id, 'title' => 'A', 'status' => 'open']);
        $manager = User::create(['tenant_id' => $tenant->id, 'name' => 'M', 'email' => "m@$sub.co", 'password' => Hash::make('x'), 'role' => 'manager']);

        // manager has can_update on leads by default (see RolePermission::defaultFor) so this must succeed
        $resp = $this->actingAs($manager)->withHeaders(['X-Tenant' => $sub])
            ->deleteJson('/api/entities/tasks/all');

        $resp->assertOk();
        $this->assertSame(1, $resp->json('data.deleted'));
    }

    public function test_delete_all_record_type(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('bda-rt');
        $type = RecordType::create(['tenant_id' => $tenant->id, 'slug' => 'invoices', 'label' => 'חשבוניות', 'position' => 0]);
        CustomFieldDefinition::create(['tenant_id' => $tenant->id, 'entity' => 'invoices', 'name' => 'title', 'label' => 'שם', 'field_type' => 'text', 'is_system' => true, 'sort_order' => 0]);
        Record::create(['tenant_id' => $tenant->id, 'record_type_id' => $type->id, 'data' => ['title' => 'A']]);
        Record::create(['tenant_id' => $tenant->id, 'record_type_id' => $type->id, 'data' => ['title' => 'B']]);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->deleteJson('/api/entities/invoices/all');

        $resp->assertOk();
        $this->assertSame(2, $resp->json('data.deleted'));
        app()->instance('current_tenant_id', $tenant->id);
        $this->assertSame(0, Record::where('record_type_id', $type->id)->count());
    }

    public function test_delete_all_unknown_entity_404s(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('bda-404');

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->deleteJson('/api/entities/nonexistent/all');

        $resp->assertStatus(404);
    }

    public function test_delete_all_record_type_from_another_tenant_404s(): void
    {
        [$tenantA, $adminA, $subA] = $this->setupTenant('bda-cross-a');
        $tenantB = Tenant::create(['name' => 'B', 'subdomain' => 'bda-cross-b', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenantB->id);
        RecordType::create(['tenant_id' => $tenantB->id, 'slug' => 'secret', 'label' => 'Secret', 'position' => 0]);

        $resp = $this->actingAs($adminA)->withHeaders(['X-Tenant' => $subA])
            ->deleteJson('/api/entities/secret/all');

        $resp->assertStatus(404);
    }

    public function test_delete_all_contacts_requires_permission(): void
    {
        [$tenant, $admin, $sub] = $this->setupTenant('bda-perm');
        $agent = User::create(['tenant_id' => $tenant->id, 'name' => 'Ag', 'email' => "ag@$sub.co", 'password' => Hash::make('x'), 'role' => 'agent']);
        Contact::create(['tenant_id' => $tenant->id, 'name' => 'A']);

        // agent role has no can_delete on contacts by default (RolePermission::defaultFor)
        $resp = $this->actingAs($agent)->withHeaders(['X-Tenant' => $sub])
            ->deleteJson('/api/entities/contacts/all');

        $resp->assertStatus(403);
        app()->instance('current_tenant_id', $tenant->id);
        $this->assertSame(1, Contact::count());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=BulkDeleteControllerTest`
Expected: FAIL (route/controller don't exist yet — 404s on every request, or class-not-found)

- [ ] **Step 3: Write the controller**

Create `backend/app/Http/Controllers/BulkDeleteController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Record;
use App\Models\RecordType;
use App\Models\RolePermission;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BulkDeleteController extends Controller
{
    // Mirrors each entity's existing single-delete route permission in
    // routes/api.php exactly — tasks uses can_update there, not can_delete.
    private const ENTITIES = [
        'leads'    => [Lead::class,    'leads',    'can_delete'],
        'contacts' => [Contact::class, 'contacts', 'can_delete'],
        'clients'  => [Client::class,  'leads',    'can_delete'],
        'tasks'    => [Task::class,    'leads',    'can_update'],
    ];

    public function destroyAll(Request $request, string $entity): JsonResponse
    {
        $tenantId = app('current_tenant_id');

        if (isset(self::ENTITIES[$entity])) {
            [$modelClass, $module, $action] = self::ENTITIES[$entity];

            abort_unless(RolePermission::allows($tenantId, $request->user()->role, $module, $action), 403);

            $count = $modelClass::count();
            $modelClass::query()->delete();

            return response()->json(['success' => true, 'data' => ['deleted' => $count]]);
        }

        $recordType = RecordType::where('tenant_id', $tenantId)->where('slug', $entity)->first();
        abort_unless($recordType, 404);

        abort_unless(RolePermission::allows($tenantId, $request->user()->role, 'leads', 'can_delete'), 403);

        $count = Record::where('record_type_id', $recordType->id)->count();
        Record::where('record_type_id', $recordType->id)->delete();

        return response()->json(['success' => true, 'data' => ['deleted' => $count]]);
    }
}
```

- [ ] **Step 4: Wire the route and remove the old one**

In `backend/routes/api.php`, add the import near the other controller `use` statements (after line 17, `use App\Http\Controllers\RecordController;`):

```php
use App\Http\Controllers\BulkDeleteController;
```

Remove lines 78-79:

```php
    Route::delete('/leads/all/clear', [LeadController::class, 'deleteAll'])
        ->middleware('permission:leads,can_delete');
```

Add the new route after the record-type records block (after line 258, `->middleware('permission:leads,can_delete');` for the record destroy route):

```php
    // Generic Delete-All — leads/contacts/clients/tasks, or any custom record-type
    // slug. Permission check happens inside the controller since the module/action
    // pair depends on which entity string is resolved.
    Route::delete('/entities/{entity}/all', [BulkDeleteController::class, 'destroyAll']);
```

- [ ] **Step 5: Remove `LeadController::deleteAll`**

In `backend/app/Http/Controllers/LeadController.php`, delete the `deleteAll` method (lines 39-52 — the whole method including its docblock/comment, from `public function deleteAll` through its closing `}`).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=BulkDeleteControllerTest`
Expected: PASS, all 7 tests

Run: `cd backend && php artisan test --filter=BulkLeadActionTest`
Expected: PASS (the two updated delete-all tests plus the untouched bulk tests)

- [ ] **Step 7: Run the full backend suite to check for regressions**

Run: `cd backend && php artisan test`
Expected: PASS — specifically confirm no other test references `/api/leads/all/clear` or `LeadController::deleteAll`

- [ ] **Step 8: Commit**

```bash
git add backend/app/Http/Controllers/BulkDeleteController.php backend/app/Http/Controllers/LeadController.php backend/routes/api.php backend/tests/Feature/BulkDeleteControllerTest.php backend/tests/Feature/BulkLeadActionTest.php
git commit -m "feat: generic Delete-All endpoint for all entities and record types"
```

---

### Task 2: Frontend — shared API call + `useDeleteAllEntity` hook

**Files:**
- Create: `frontend/src/api/bulkDelete.js`
- Create: `frontend/src/hooks/useBulkDelete.js`

**Interfaces:**
- Consumes: `client` default export from `frontend/src/api/client.js` (axios instance already used by every other `api/*.js` file, e.g. `frontend/src/api/contacts.js:1`).
- Produces: `useDeleteAllEntity(entity, queryKey)` — a TanStack `useMutation` hook. `mutateAsync()` resolves to `{deleted: <int>}` on success, invalidates the query cache for `queryKey` on success.

- [ ] **Step 1: Create the API wrapper**

Create `frontend/src/api/bulkDelete.js`:

```js
import client from './client'

export const bulkDeleteApi = {
  deleteAll: (entity) => client.delete(`/entities/${entity}/all`),
}
```

- [ ] **Step 2: Create the hook**

Create `frontend/src/hooks/useBulkDelete.js`:

```js
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { bulkDeleteApi } from '../api/bulkDelete'

export function useDeleteAllEntity(entity, queryKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => bulkDeleteApi.deleteAll(entity).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })
}
```

- [ ] **Step 3: Verify it builds**

Run: `cd frontend && npx vite build`
Expected: clean build, no import errors (nothing consumes this hook yet — this step only checks the two new files themselves are syntactically valid and resolve their imports).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/bulkDelete.js frontend/src/hooks/useBulkDelete.js
git commit -m "feat: shared Delete-All API client and hook"
```

---

### Task 3: Frontend — `DeleteAllModal` shared component

**Files:**
- Create: `frontend/src/components/ui/DeleteAllModal.jsx`

**Interfaces:**
- Consumes: nothing from other tasks (pure presentational component + local state).
- Produces: `<DeleteAllModal open, onClose, onConfirm, entityLabel, total />` — `onConfirm` is called (and awaited) only once the user has typed "מחק" exactly and clicked confirm. Used by Task 4-7's page wiring, one instance per page.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/ui/DeleteAllModal.jsx`:

```jsx
import { useState } from 'react'

export default function DeleteAllModal({ open, onClose, onConfirm, entityLabel, total }) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)

  if (!open) return null

  const canConfirm = text === 'מחק' && !pending

  const handleConfirm = async () => {
    setPending(true)
    try {
      await onConfirm()
      setText('')
      onClose()
    } finally {
      setPending(false)
    }
  }

  const handleClose = () => {
    setText('')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={handleClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-red-600 dark:text-red-400">מחיקת הכל</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            פעולה בלתי הפיכה! ימחקו כל {total} {entityLabel}.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              הקלד "מחק" לאישור
            </label>
            <input
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={!canConfirm}
              onClick={handleConfirm}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {pending ? 'מוחק...' : 'מחק הכל לצמיתות'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm"
            >
              ביטול
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd frontend && npx vite build`
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/DeleteAllModal.jsx
git commit -m "feat: shared DeleteAllModal component"
```

---

### Task 4: Wire into `LeadsPage.jsx` (replace the existing prompt-based flow)

**Files:**
- Modify: `frontend/src/pages/leads/LeadsPage.jsx`
- Modify: `frontend/src/hooks/useLeads.js` — remove `useDeleteAllLeads` (lines 86-92)
- Modify: `frontend/src/api/leads.js` — remove `deleteAll` (line 13)

**Interfaces:**
- Consumes: `useDeleteAllEntity` from Task 2, `DeleteAllModal` from Task 3.

- [ ] **Step 1: Remove the old leads-only implementation**

In `frontend/src/hooks/useLeads.js`, delete the `useDeleteAllLeads` function (lines 86-92).

In `frontend/src/api/leads.js`, delete line 13 (`deleteAll: () => client.delete('/leads/all/clear'),`).

- [ ] **Step 2: Update `LeadsPage.jsx` imports**

Line 3 currently reads:
```js
import { useLeads, useCreateLead, useChangeLeadStage, useUpdateLead, useBulkLeadAction, useDeleteAllLeads } from '../../hooks/useLeads'
```
Change to (removing `useDeleteAllLeads`):
```js
import { useLeads, useCreateLead, useChangeLeadStage, useUpdateLead, useBulkLeadAction } from '../../hooks/useLeads'
```

Add two new imports directly below it:
```js
import { useDeleteAllEntity } from '../../hooks/useBulkDelete'
import DeleteAllModal from '../../components/ui/DeleteAllModal'
```

- [ ] **Step 3: Replace the mutation and handler**

Line 194 currently reads:
```js
  const deleteAll   = useDeleteAllLeads()
```
Change to:
```js
  const deleteAll   = useDeleteAllEntity('leads', ['leads'])
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
```

Lines 269-273 currently read:
```js
  const handleDeleteAll = async () => {
    const ok = window.prompt(`פעולה בלתי הפיכה! ימחקו כל ${total} ה${t('leads')}.\nהקלד "מחק" לאישור:`)
    if (ok !== 'מחק') return
    await deleteAll.mutateAsync()
  }
```
Delete this whole block — the confirmation now lives inside `DeleteAllModal`, triggered directly by the button's `onClick`.

- [ ] **Step 4: Update the button and add the modal**

Lines 605-609 currently read:
```jsx
            {can('leads', 'can_delete') && total > 0 && (
              <button onClick={handleDeleteAll} disabled={deleteAll.isPending}
                className="border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 px-3 py-2 rounded-lg text-sm transition-colors">
                מחק הכל
              </button>
            )}
```
Delete this block entirely — the trigger moves down to the pagination area (Step 5).

Find the pagination block (lines 810-821):
```jsx
          {/* Pagination */}
          {lastPage > 1 && (
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500 dark:text-gray-400">
              <span>עמוד {page} מתוך {lastPage} · סה"כ {total} {t('leads')}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">הקודם</button>
                <button onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page >= lastPage}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">הבא</button>
              </div>
            </div>
          )}
```
Replace with (wraps the existing pagination in a persistent footer row that always shows the Delete-All trigger, independent of `lastPage`):
```jsx
          {/* Footer: pagination (when applicable) + Delete All */}
          <div className="flex items-center justify-between mt-3 text-sm text-gray-500 dark:text-gray-400">
            {lastPage > 1 ? (
              <>
                <span>עמוד {page} מתוך {lastPage} · סה"כ {total} {t('leads')}</span>
                <div className="flex gap-2 items-center">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">הקודם</button>
                  <button onClick={() => setPage(p => Math.min(lastPage, p + 1))} disabled={page >= lastPage}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">הבא</button>
                  {can('leads', 'can_delete') && total > 0 && (
                    <button onClick={() => setDeleteAllOpen(true)}
                      className="border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm transition-colors">מחק הכל</button>
                  )}
                </div>
              </>
            ) : (
              <>
                <span />
                {can('leads', 'can_delete') && total > 0 && (
                  <button onClick={() => setDeleteAllOpen(true)}
                    className="border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm transition-colors">מחק הכל</button>
                )}
              </>
            )}
          </div>

          <DeleteAllModal
            open={deleteAllOpen}
            onClose={() => setDeleteAllOpen(false)}
            onConfirm={() => deleteAll.mutateAsync()}
            entityLabel={t('leads')}
            total={total}
          />
```

- [ ] **Step 5: Verify build and no other references remain**

Run: `cd frontend && npx vite build`
Expected: clean build.

Run: `grep -rn "useDeleteAllLeads\|leads/all/clear" frontend/src backend/app backend/routes`
Expected: no output.

- [ ] **Step 6: Manual verification in browser**

Log in, go to Leads, confirm: the old "מחק הכל" button no longer appears at the top next to the page title; a "מחק הכל" button appears near the bottom (pagination area, or just above where pagination would be if there's only one page); clicking it opens a real modal (not a browser `prompt()`), the confirm button stays disabled until "מחק" is typed exactly, and confirming actually deletes all leads and refreshes the list to empty.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/leads/LeadsPage.jsx frontend/src/hooks/useLeads.js frontend/src/api/leads.js
git commit -m "refactor: move leads Delete-All onto the generic modal/endpoint"
```

---

### Task 5: Wire into `ContactsPage.jsx`

**Files:**
- Modify: `frontend/src/pages/contacts/ContactsPage.jsx`

**Interfaces:**
- Consumes: `useDeleteAllEntity` from Task 2, `DeleteAllModal` from Task 3.

- [ ] **Step 1: Add imports and state**

Add near the top imports (after line 6, `import { translations } from '../../i18n/translations'`):
```js
import { useDeleteAllEntity } from '../../hooks/useBulkDelete'
import DeleteAllModal from '../../components/ui/DeleteAllModal'
```

Inside `ContactsPage`, after line 36 (`const deleteContact       = useDeleteContact()`), add:
```js
  const deleteAll = useDeleteAllEntity('contacts', ['contacts'])
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
```

- [ ] **Step 2: Add the footer trigger and modal after the table**

The table currently ends at line 145 with:
```jsx
      </div>

      {modal && (
```
Insert a footer block between the closing `</div>` of the table wrapper and the `{modal && (`:
```jsx
      </div>

      <div className="flex items-center justify-end mt-3">
        {can('contacts', 'can_delete') && total > 0 && (
          <button onClick={() => setDeleteAllOpen(true)}
            className="border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm transition-colors">מחק הכל</button>
        )}
      </div>

      <DeleteAllModal
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        onConfirm={() => deleteAll.mutateAsync()}
        entityLabel={tr('contacts')}
        total={total}
      />

      {modal && (
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx vite build`
Expected: clean build.

- [ ] **Step 4: Manual verification in browser**

Go to Contacts, confirm the "מחק הכל" button appears under the table, opens the real modal, requires typing "מחק", and deletes all contacts on confirm.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/contacts/ContactsPage.jsx
git commit -m "feat: wire Delete-All into Contacts page"
```

---

### Task 6: Wire into `ClientsPage.jsx`

**Files:**
- Modify: `frontend/src/pages/clients/ClientsPage.jsx`

**Interfaces:**
- Consumes: `useDeleteAllEntity` from Task 2, `DeleteAllModal` from Task 3.

- [ ] **Step 1: Add imports and state**

Add near the top imports (after line 23, `import { useAuth } from '../../context/AuthContext'`):
```js
import { useDeleteAllEntity } from '../../hooks/useBulkDelete'
import DeleteAllModal from '../../components/ui/DeleteAllModal'
```

Inside `ClientsPage`, after line 51 (the `destroy` mutation's closing `})`), add:
```js
  const deleteAll = useDeleteAllEntity('clients', ['clients'])
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
```

- [ ] **Step 2: Add the footer trigger and modal after the table**

The table currently ends at line 181 with:
```jsx
      </div>

      {/* Add modal */}
```
Insert between them:
```jsx
      </div>

      <div className="flex items-center justify-end mt-3">
        {can('leads', 'can_delete') && total > 0 && (
          <button onClick={() => setDeleteAllOpen(true)}
            className="border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm transition-colors">מחק הכל</button>
        )}
      </div>

      <DeleteAllModal
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        onConfirm={() => deleteAll.mutateAsync()}
        entityLabel="לקוחות"
        total={total}
      />

      {/* Add modal */}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx vite build`
Expected: clean build.

- [ ] **Step 4: Manual verification in browser**

Go to Clients, confirm the "מחק הכל" button appears under the table and works end-to-end.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/clients/ClientsPage.jsx
git commit -m "feat: wire Delete-All into Clients page"
```

---

### Task 7: Wire into `TasksPage.jsx`

**Files:**
- Modify: `frontend/src/pages/tasks/TasksPage.jsx`

**Interfaces:**
- Consumes: `useDeleteAllEntity` from Task 2, `DeleteAllModal` from Task 3.

**Note:** `tasksApi.list` returns a plain array (`frontend/src/pages/tasks/TasksPage.jsx:52`, `const tasks = Array.isArray(data) ? data : []`), not a paginated envelope — there is no `total` from the API. Use `tasks.length` as the count shown in the modal, and invalidate `['tasks']` and `['task-counts']` like the other task mutations already do (see `remove` mutation, lines 63-66) rather than relying on the hook's default single-key invalidation.

- [ ] **Step 1: Add imports and state**

Add near the top imports (after line 6, `import { useToast } from '../../context/ToastContext'`):
```js
import { useDeleteAllEntity } from '../../hooks/useBulkDelete'
import DeleteAllModal from '../../components/ui/DeleteAllModal'
```

Inside `TasksPage`, after the `remove` mutation (line 66, its closing `})`), add:
```js
  const deleteAll = useDeleteAllEntity('tasks', ['tasks'])
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)

  const handleDeleteAllConfirm = async () => {
    await deleteAll.mutateAsync()
    qc.invalidateQueries({ queryKey: ['task-counts'] })
  }
```

- [ ] **Step 2: Add the footer trigger and modal after the task list**

The list currently ends at line 160 with:
```jsx
      </div>

      {/* Create modal */}
```
Insert between them:
```jsx
      </div>

      <div className="flex items-center justify-end mt-3">
        {can('leads', 'can_update') && tasks.length > 0 && (
          <button onClick={() => setDeleteAllOpen(true)}
            className="border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm transition-colors">מחק הכל</button>
        )}
      </div>

      <DeleteAllModal
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        onConfirm={handleDeleteAllConfirm}
        entityLabel="משימות"
        total={tasks.length}
      />

      {/* Create modal */}
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx vite build`
Expected: clean build.

- [ ] **Step 4: Manual verification in browser**

Go to Tasks, confirm the "מחק הכל" button appears under the task list, works end-to-end, and the task-count badges elsewhere in the UI (e.g. sidebar counts) update after deletion.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tasks/TasksPage.jsx
git commit -m "feat: wire Delete-All into Tasks page"
```

---

### Task 8: Wire into `RecordsPage.jsx` (covers every custom record type)

**Files:**
- Modify: `frontend/src/pages/records/RecordsPage.jsx`

**Interfaces:**
- Consumes: `useDeleteAllEntity` from Task 2, `DeleteAllModal` from Task 3.

**Note:** This page is generic over `record_type.slug` (the `slug` route param) — this one wiring covers every current and future custom record type with no per-type code, satisfying the spec's requirement 4.

- [ ] **Step 1: Add imports and state**

Add near the top imports (after line 6, `import { useAuth } from '../../context/AuthContext'`):
```js
import { useDeleteAllEntity } from '../../hooks/useBulkDelete'
import DeleteAllModal from '../../components/ui/DeleteAllModal'
```

Inside `RecordsPage`, after the `deleteRecord` mutation (line 77, its closing `})`), add:
```js
  const deleteAll = useDeleteAllEntity(slug, ['records', slug])
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
```

- [ ] **Step 2: Add the footer trigger and modal after the table**

The table currently ends at line 193 with:
```jsx
      </div>

      {modal && (
```
Insert between them:
```jsx
      </div>

      <div className="flex items-center justify-end mt-3">
        {canDelete && total > 0 && (
          <button onClick={() => setDeleteAllOpen(true)}
            className="border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm transition-colors">מחק הכל</button>
        )}
      </div>

      <DeleteAllModal
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        onConfirm={() => deleteAll.mutateAsync()}
        entityLabel={type?.label ?? 'רשומות'}
        total={total}
      />

      {modal && (
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx vite build`
Expected: clean build.

- [ ] **Step 4: Manual verification in browser**

Go to a custom record type page (e.g. one of Sonia's invoice types), confirm the "מחק הכל" button appears under the table and works end-to-end.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/records/RecordsPage.jsx
git commit -m "feat: wire Delete-All into custom record type pages"
```

---

## Final check (after all tasks)

- [ ] Run `cd backend && php artisan test` — full suite passes.
- [ ] Run `cd frontend && npx vite build` — clean build.
- [ ] Run `grep -rn "deleteAll\|leads/all/clear" backend/app backend/routes frontend/src` and confirm every remaining hit is part of the new generic implementation (`BulkDeleteController`, `useDeleteAllEntity`, `bulkDeleteApi`), not a leftover of the old leads-only one.
