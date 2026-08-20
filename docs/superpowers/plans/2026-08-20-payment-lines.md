# Payment Lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeating payment-lines sub-table to invoice-like record types (split-payment tracking: payment type, amount, date), a nested CRUD API for it, and a generic `payments:*` widget-builder entity so "by payment type" breakdowns become buildable — then use it to add "הכנסות לפי סוג תשלום" to Sonia's live board.

**Architecture:** New `record_payment_lines` child table (real columns, FK to `records`) alongside the existing flat-JSON `records.data` model. Two new columns on `record_types` (`has_payment_lines`, `has_payment_lines_amount_field`) flag which types get the feature. Nested REST routes under the existing `record-types/{recordType}/records/{record}/...` convention. `WidgetDataService` gets a second descriptor-builder (`buildPaymentDescriptor`) alongside `buildRecordDescriptor`, exposed through the same generic `entity` key mechanism `AddWidgetModal` already consumes with zero UI changes required.

**Tech Stack:** Laravel 10 (PHP), MySQL/SQLite, PHPUnit; React + TanStack Query + Tailwind, Vitest.

## Global Constraints

- Every schema change needs a migration in `SCHEMA_DB/` using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`, mirroring a matching `backend/database/migrations/*.php` file (per project `CLAUDE.md`).
- `payment_type` is a hardcoded 6-value enum (not tenant-configurable): `bit` (Bit), `amex` (אמריקן אקספרס), `transfer` (העברה), `visa_leumi` (ויזה לאומי), `mastercard` (מאסטרקארד), `cash` (מזומן).
- Every tenant-scoped query/model must respect `HasTenantScope` (`backend/app/Traits/HasTenantScope.php`) or explicit `tenant_id` filtering — never trust a route-bound model without an `abort_unless` tenant check, matching `RecordController`'s pattern.
- The amount-mismatch check is a soft warning only — returned in the API response, never blocks a write.
- No backfill of existing invoice records — feature only applies going forward.
- Widget entity keys: `payments:all` (all record types with `has_payment_lines=1` for the tenant) and `payments:<slug>` (one type).

---

### Task 1: Schema — `record_types` flag columns + `record_payment_lines` table

**Files:**
- Create: `backend/database/migrations/2026_08_20_000001_add_payment_lines_to_record_types.php`
- Create: `SCHEMA_DB/2026_08_20_000001_add_payment_lines_to_record_types.sql`
- Create: `backend/database/migrations/2026_08_20_000002_create_record_payment_lines_table.php`
- Create: `SCHEMA_DB/2026_08_20_000002_create_record_payment_lines_table.sql`
- Modify: `backend/app/Models/RecordType.php`
- Modify: `backend/app/Models/Record.php`
- Create: `backend/app/Models/RecordPaymentLine.php`
- Test: `backend/tests/Feature/RecordPaymentLineModelTest.php`

**Interfaces:**
- Produces: `RecordType::$fillable` gains `has_payment_lines` (bool), `has_payment_lines_amount_field` (string|null). `Record::paymentLines(): HasMany` returns `RecordPaymentLine` ordered by `position`. `RecordPaymentLine::PAYMENT_TYPES` — `array<string,string>` enum key => Hebrew label, consumed by Task 2's controller and Task 4's widget descriptor.

- [ ] **Step 1: Write the failing test**

```php
<?php
namespace Tests\Feature;

use App\Models\Record;
use App\Models\RecordPaymentLine;
use App\Models\RecordType;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RecordPaymentLineModelTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $sub): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        return [$tenant, $admin];
    }

    public function test_record_type_has_payment_lines_columns_and_record_relation_works(): void
    {
        [$tenant] = $this->admin('pl-model');
        app()->instance('current_tenant_id', $tenant->id);

        $type = RecordType::create([
            'tenant_id' => $tenant->id, 'slug' => 'invoices', 'label' => 'Invoices', 'position' => 0,
            'has_payment_lines' => true, 'has_payment_lines_amount_field' => 'amount',
        ]);
        $record = Record::create(['tenant_id' => $tenant->id, 'record_type_id' => $type->id, 'data' => ['amount' => 100]]);

        RecordPaymentLine::create([
            'tenant_id' => $tenant->id, 'record_id' => $record->id,
            'payment_type' => 'cash', 'amount' => 60, 'position' => 0,
        ]);
        RecordPaymentLine::create([
            'tenant_id' => $tenant->id, 'record_id' => $record->id,
            'payment_type' => 'bit', 'amount' => 40, 'position' => 1,
        ]);

        $fresh = $type->fresh();
        $this->assertTrue($fresh->has_payment_lines);
        $this->assertSame('amount', $fresh->has_payment_lines_amount_field);
        $this->assertCount(2, $record->fresh()->paymentLines);
        $this->assertSame('cash', $record->fresh()->paymentLines->first()->payment_type);
        $this->assertArrayHasKey('bit', RecordPaymentLine::PAYMENT_TYPES);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=RecordPaymentLineModelTest`
Expected: FAIL — `has_payment_lines` column / `record_payment_lines` table / `RecordPaymentLine` class don't exist yet.

- [ ] **Step 3: Write the migrations**

`backend/database/migrations/2026_08_20_000001_add_payment_lines_to_record_types.php`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('record_types', function (Blueprint $table) {
            if (! Schema::hasColumn('record_types', 'has_payment_lines')) {
                $table->boolean('has_payment_lines')->default(false)->after('position');
            }
            if (! Schema::hasColumn('record_types', 'has_payment_lines_amount_field')) {
                $table->string('has_payment_lines_amount_field')->nullable()->after('has_payment_lines');
            }
        });
    }

    public function down(): void
    {
        Schema::table('record_types', function (Blueprint $table) {
            $table->dropColumn(['has_payment_lines', 'has_payment_lines_amount_field']);
        });
    }
};
```

`SCHEMA_DB/2026_08_20_000001_add_payment_lines_to_record_types.sql`:
```sql
-- Migration: 2026-08-20
-- Mirrors: database/migrations/2026_08_20_000001_add_payment_lines_to_record_types.php
-- Purpose: flag which custom record types are "invoice-like" (show a payment-lines
-- sub-table on the record edit view, usable as a payments:<slug> widget entity),
-- and which of that type's fields holds the invoice total for the soft
-- amount-mismatch warning.

ALTER TABLE `record_types` ADD COLUMN IF NOT EXISTS `has_payment_lines` TINYINT(1) NOT NULL DEFAULT 0 AFTER `position`;
ALTER TABLE `record_types` ADD COLUMN IF NOT EXISTS `has_payment_lines_amount_field` VARCHAR(255) NULL AFTER `has_payment_lines`;
```

`backend/database/migrations/2026_08_20_000002_create_record_payment_lines_table.php`:
```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('record_payment_lines')) {
            Schema::create('record_payment_lines', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('record_id')->constrained('records')->cascadeOnDelete();
                $table->string('payment_type', 50);
                $table->decimal('amount', 12, 2);
                $table->date('paid_at')->nullable();
                $table->unsignedInteger('position')->default(0);
                $table->timestamps();
                $table->index(['tenant_id', 'record_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('record_payment_lines');
    }
};
```

`SCHEMA_DB/2026_08_20_000002_create_record_payment_lines_table.sql`:
```sql
-- Migration: 2026-08-20
-- Mirrors: database/migrations/2026_08_20_000002_create_record_payment_lines_table.php
-- Purpose: repeating split-payment lines under one invoice-like record (payment
-- type, amount, date) — Sonia's old Fireberry system tracked this as a
-- sub-table per receipt; this CRM's records.data JSON has no child-row concept,
-- so it gets its own real table instead of trying to nest it in JSON.

CREATE TABLE IF NOT EXISTS `record_payment_lines` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `record_id` BIGINT UNSIGNED NOT NULL,
    `payment_type` VARCHAR(50) NOT NULL,
    `amount` DECIMAL(12,2) NOT NULL,
    `paid_at` DATE NULL,
    `position` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    INDEX `record_payment_lines_tenant_id_record_id_index` (`tenant_id`, `record_id`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 4: Write the models**

`backend/app/Models/RecordPaymentLine.php`:
```php
<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RecordPaymentLine extends Model
{
    use HasTenantScope;

    protected $fillable = ['tenant_id', 'record_id', 'payment_type', 'amount', 'paid_at', 'position'];

    protected $casts = ['amount' => 'decimal:2', 'paid_at' => 'date:Y-m-d'];

    /** Fixed enum — not tenant-configurable. key => Hebrew label. */
    public const PAYMENT_TYPES = [
        'bit'        => 'Bit',
        'amex'       => 'אמריקן אקספרס',
        'transfer'   => 'העברה',
        'visa_leumi' => 'ויזה לאומי',
        'mastercard' => 'מאסטרקארד',
        'cash'       => 'מזומן',
    ];

    public function record(): BelongsTo
    {
        return $this->belongsTo(Record::class);
    }
}
```

Modify `backend/app/Models/RecordType.php` — extend `$fillable` and add a boolean cast:
```php
protected $fillable = [
    'tenant_id', 'slug', 'label', 'label_singular', 'icon', 'position',
    'has_payment_lines', 'has_payment_lines_amount_field',
];

protected $casts = ['has_payment_lines' => 'boolean'];
```

Modify `backend/app/Models/Record.php` — add the relation:
```php
use Illuminate\Database\Eloquent\Relations\HasMany;
// ...
public function paymentLines(): HasMany
{
    return $this->hasMany(RecordPaymentLine::class)->orderBy('position');
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=RecordPaymentLineModelTest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/database/migrations/2026_08_20_000001_add_payment_lines_to_record_types.php \
        backend/database/migrations/2026_08_20_000002_create_record_payment_lines_table.php \
        "SCHEMA_DB/2026_08_20_000001_add_payment_lines_to_record_types.sql" \
        "SCHEMA_DB/2026_08_20_000002_create_record_payment_lines_table.sql" \
        backend/app/Models/RecordType.php backend/app/Models/Record.php backend/app/Models/RecordPaymentLine.php \
        backend/tests/Feature/RecordPaymentLineModelTest.php
git commit -m "feat: record_payment_lines table + has_payment_lines flag on record_types"
```

---

### Task 2: Backend CRUD — `PaymentLineController` + routes

**Files:**
- Create: `backend/app/Http/Controllers/PaymentLineController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/PaymentLineControllerTest.php`

**Interfaces:**
- Consumes: `RecordPaymentLine::PAYMENT_TYPES` (Task 1), `Record::paymentLines()` (Task 1), `RecordType::has_payment_lines` / `has_payment_lines_amount_field` (Task 1).
- Produces: routes `GET/POST /record-types/{recordType}/records/{record}/payment-lines`, `PUT/DELETE /record-types/{recordType}/records/{record}/payment-lines/{paymentLine}`. Every write response is `{success, data, warning}` where `warning` is `string|null`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/Feature/PaymentLineControllerTest.php`:
```php
<?php
namespace Tests\Feature;

use App\Models\Record;
use App\Models\RecordType;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PaymentLineControllerTest extends TestCase
{
    use RefreshDatabase;

    private function setup(): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => 'pl-ctrl', 'status' => 'active']);
        $admin  = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => 'a@pl-ctrl.co', 'password' => Hash::make('x'), 'role' => 'admin']);
        app()->instance('current_tenant_id', $tenant->id);
        $type = RecordType::create([
            'tenant_id' => $tenant->id, 'slug' => 'invoices', 'label' => 'Invoices', 'position' => 0,
            'has_payment_lines' => true, 'has_payment_lines_amount_field' => 'amount',
        ]);
        $record = Record::create(['tenant_id' => $tenant->id, 'record_type_id' => $type->id, 'data' => ['amount' => 100]]);

        return [$tenant, $admin, $type, $record];
    }

    private function auth($admin)
    {
        return $this->actingAs($admin)->withHeaders(['X-Tenant' => 'pl-ctrl']);
    }

    public function test_create_line_returns_no_warning_when_totals_match(): void
    {
        [, $admin, $type, $record] = $this->setup();

        $resp = $this->auth($admin)->postJson(
            "/api/record-types/{$type->id}/records/{$record->id}/payment-lines",
            ['payment_type' => 'cash', 'amount' => 100]
        );

        $resp->assertCreated();
        $this->assertNull($resp->json('warning'));
        $this->assertSame('cash', $resp->json('data.payment_type'));
    }

    public function test_create_line_returns_soft_warning_when_totals_mismatch(): void
    {
        [, $admin, $type, $record] = $this->setup();

        $resp = $this->auth($admin)->postJson(
            "/api/record-types/{$type->id}/records/{$record->id}/payment-lines",
            ['payment_type' => 'cash', 'amount' => 40]
        );

        $resp->assertCreated();
        $this->assertNotNull($resp->json('warning'));
    }

    public function test_rejects_line_on_record_type_without_payment_lines(): void
    {
        [$tenant, $admin] = $this->setup();
        $plainType = RecordType::create(['tenant_id' => $tenant->id, 'slug' => 'notes', 'label' => 'Notes', 'position' => 1]);
        $plainRecord = Record::create(['tenant_id' => $tenant->id, 'record_type_id' => $plainType->id, 'data' => []]);

        $resp = $this->auth($admin)->postJson(
            "/api/record-types/{$plainType->id}/records/{$plainRecord->id}/payment-lines",
            ['payment_type' => 'cash', 'amount' => 10]
        );

        $resp->assertStatus(422);
    }

    public function test_rejects_invalid_payment_type(): void
    {
        [, $admin, $type, $record] = $this->setup();

        $resp = $this->auth($admin)->postJson(
            "/api/record-types/{$type->id}/records/{$record->id}/payment-lines",
            ['payment_type' => 'paypal', 'amount' => 10]
        );

        $resp->assertStatus(422);
    }

    public function test_update_and_delete_line(): void
    {
        [, $admin, $type, $record] = $this->setup();
        $lineId = $this->auth($admin)->postJson(
            "/api/record-types/{$type->id}/records/{$record->id}/payment-lines",
            ['payment_type' => 'cash', 'amount' => 100]
        )->json('data.id');

        $upd = $this->auth($admin)->putJson(
            "/api/record-types/{$type->id}/records/{$record->id}/payment-lines/{$lineId}",
            ['amount' => 50]
        );
        $upd->assertOk();
        $this->assertEquals(50, $upd->json('data.amount'));

        $del = $this->auth($admin)->deleteJson(
            "/api/record-types/{$type->id}/records/{$record->id}/payment-lines/{$lineId}"
        );
        $del->assertOk();
        $this->assertCount(0, $record->fresh()->paymentLines);
    }

    public function test_index_scoped_to_record(): void
    {
        [, $admin, $type, $record] = $this->setup();
        $this->auth($admin)->postJson(
            "/api/record-types/{$type->id}/records/{$record->id}/payment-lines",
            ['payment_type' => 'cash', 'amount' => 100]
        );

        $resp = $this->auth($admin)->getJson("/api/record-types/{$type->id}/records/{$record->id}/payment-lines");
        $resp->assertOk();
        $this->assertCount(1, $resp->json('data'));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=PaymentLineControllerTest`
Expected: FAIL — route `payment-lines` doesn't exist (404s).

- [ ] **Step 3: Write the controller**

`backend/app/Http/Controllers/PaymentLineController.php`:
```php
<?php

namespace App\Http\Controllers;

use App\Models\Record;
use App\Models\RecordPaymentLine;
use App\Models\RecordType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentLineController extends Controller
{
    private function scopeOrAbort(RecordType $recordType, Record $record): void
    {
        abort_unless($recordType->tenant_id === app('current_tenant_id'), 403);
        abort_unless($record->record_type_id === $recordType->id, 404);
    }

    /** Soft warning only — never blocks a write. Null when nothing to compare. */
    private function warningFor(Record $record): ?string
    {
        $amountField = $record->recordType->has_payment_lines_amount_field;
        if (! $amountField) {
            return null;
        }

        $invoiceAmount = $record->data[$amountField] ?? null;
        if ($invoiceAmount === null || $invoiceAmount === '') {
            return null;
        }

        $linesTotal = (float) $record->paymentLines()->sum('amount');
        if (round((float) $invoiceAmount, 2) === round($linesTotal, 2)) {
            return null;
        }

        return sprintf(
            'סכום שורות התשלום (%s) שונה מסכום החשבונית (%s)',
            number_format($linesTotal, 2),
            number_format((float) $invoiceAmount, 2)
        );
    }

    public function index(RecordType $recordType, Record $record): JsonResponse
    {
        $this->scopeOrAbort($recordType, $record);

        return response()->json(['success' => true, 'data' => $record->paymentLines]);
    }

    public function store(Request $request, RecordType $recordType, Record $record): JsonResponse
    {
        $this->scopeOrAbort($recordType, $record);
        abort_unless($recordType->has_payment_lines, 422, 'סוג רשומה זה אינו תומך בשורות תשלום');

        $data = $request->validate([
            'payment_type' => 'required|in:' . implode(',', array_keys(RecordPaymentLine::PAYMENT_TYPES)),
            'amount'       => 'required|numeric|min:0.01',
            'paid_at'      => 'nullable|date',
        ]);

        $maxPosition = $record->paymentLines()->max('position') ?? -1;

        $line = RecordPaymentLine::create([
            'record_id'    => $record->id,
            'payment_type' => $data['payment_type'],
            'amount'       => $data['amount'],
            'paid_at'      => $data['paid_at'] ?? null,
            'position'     => $maxPosition + 1,
        ]);

        return response()->json([
            'success' => true,
            'data'    => $line,
            'warning' => $this->warningFor($record->fresh()),
        ], 201);
    }

    public function update(Request $request, RecordType $recordType, Record $record, RecordPaymentLine $paymentLine): JsonResponse
    {
        $this->scopeOrAbort($recordType, $record);
        abort_unless($paymentLine->record_id === $record->id, 404);

        $data = $request->validate([
            'payment_type' => 'sometimes|in:' . implode(',', array_keys(RecordPaymentLine::PAYMENT_TYPES)),
            'amount'       => 'sometimes|numeric|min:0.01',
            'paid_at'      => 'nullable|date',
        ]);

        $paymentLine->update($data);

        return response()->json([
            'success' => true,
            'data'    => $paymentLine->fresh(),
            'warning' => $this->warningFor($record->fresh()),
        ]);
    }

    public function destroy(RecordType $recordType, Record $record, RecordPaymentLine $paymentLine): JsonResponse
    {
        $this->scopeOrAbort($recordType, $record);
        abort_unless($paymentLine->record_id === $record->id, 404);

        $paymentLine->delete();

        return response()->json([
            'success' => true,
            'data'    => null,
            'warning' => $this->warningFor($record->fresh()),
        ]);
    }
}
```

- [ ] **Step 4: Register routes**

In `backend/routes/api.php`, add the import next to the other controller imports (after line 18's `RecordController`):
```php
use App\Http\Controllers\PaymentLineController;
```

Add the route block immediately after the "Records within a custom record type" block (after line 306, before the "Generic Delete-All" comment):
```php
    // Payment lines — split-payment sub-rows on an invoice-like record
    Route::get('/record-types/{recordType}/records/{record}/payment-lines',
        [PaymentLineController::class, 'index'])
        ->middleware('permission:leads,can_read');
    Route::post('/record-types/{recordType}/records/{record}/payment-lines',
        [PaymentLineController::class, 'store'])
        ->middleware('permission:leads,can_update');
    Route::put('/record-types/{recordType}/records/{record}/payment-lines/{paymentLine}',
        [PaymentLineController::class, 'update'])
        ->middleware('permission:leads,can_update');
    Route::delete('/record-types/{recordType}/records/{record}/payment-lines/{paymentLine}',
        [PaymentLineController::class, 'destroy'])
        ->middleware('permission:leads,can_update');
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=PaymentLineControllerTest`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Controllers/PaymentLineController.php backend/routes/api.php \
        backend/tests/Feature/PaymentLineControllerTest.php
git commit -m "feat: nested payment-lines CRUD API with soft amount-mismatch warning"
```

---

### Task 3: Widget builder — `payments:*` pseudo-entity

**Files:**
- Modify: `backend/app/Services/Reporting/WidgetDataService.php`
- Modify: `backend/app/Http/Controllers/WidgetController.php`
- Test: `backend/tests/Feature/PaymentLineWidgetTest.php`

**Interfaces:**
- Consumes: `RecordPaymentLine::PAYMENT_TYPES` (Task 1), `RecordType::has_payment_lines` (Task 1).
- Produces: `WidgetDataService::buildPaymentDescriptor(?string $slug): array` (an `EntityDescriptor`-shaped array, `$slug === null` means "all"). `resolveDescriptor()` routes `payments:all` and `payments:<slug>` here. `WidgetController::fields()` advertises these as `meta.entities`, so `AddWidgetModal.jsx` picks them up with no frontend changes (its entity `<select>` already iterates `meta.entities` generically).

- [ ] **Step 1: Write the failing test**

`backend/tests/Feature/PaymentLineWidgetTest.php`:
```php
<?php
namespace Tests\Feature;

use App\Models\Record;
use App\Models\RecordPaymentLine;
use App\Models\RecordType;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PaymentLineWidgetTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $sub): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        return [$tenant, $admin];
    }

    public function test_widget_fields_advertises_payments_all_entity(): void
    {
        [$tenant, $admin] = $this->admin('pl-widget-fields');
        app()->instance('current_tenant_id', $tenant->id);
        RecordType::create(['tenant_id' => $tenant->id, 'slug' => 'invoices', 'label' => 'חשבוניות', 'position' => 0, 'has_payment_lines' => true]);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => 'pl-widget-fields'])
            ->getJson('/api/dashboard/widget-fields');

        $resp->assertOk();
        $keys = collect($resp->json('data.entities'))->pluck('key')->all();
        $this->assertContains('payments:all', $keys);
        $this->assertContains('payments:invoices', $keys);
        $this->assertArrayHasKey('payment_type', $resp->json('data.fields.payments:all.groupFields'));
    }

    public function test_widget_data_aggregates_payments_all_by_payment_type(): void
    {
        [$tenant, $admin] = $this->admin('pl-widget-data');
        app()->instance('current_tenant_id', $tenant->id);
        $type = RecordType::create(['tenant_id' => $tenant->id, 'slug' => 'invoices', 'label' => 'חשבוניות', 'position' => 0, 'has_payment_lines' => true]);
        $r1 = Record::create(['tenant_id' => $tenant->id, 'record_type_id' => $type->id, 'data' => []]);
        $r2 = Record::create(['tenant_id' => $tenant->id, 'record_type_id' => $type->id, 'data' => []]);
        RecordPaymentLine::create(['tenant_id' => $tenant->id, 'record_id' => $r1->id, 'payment_type' => 'cash', 'amount' => 100, 'position' => 0]);
        RecordPaymentLine::create(['tenant_id' => $tenant->id, 'record_id' => $r2->id, 'payment_type' => 'cash', 'amount' => 50, 'position' => 0]);
        RecordPaymentLine::create(['tenant_id' => $tenant->id, 'record_id' => $r2->id, 'payment_type' => 'bit', 'amount' => 30, 'position' => 1]);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => 'pl-widget-data'])
            ->getJson('/api/dashboard/widget-data?' . http_build_query([
                'entity'       => 'payments:all',
                'valueField'   => 'amount',
                'aggregation'  => 'sum',
                'displayField' => 'payment_type',
            ]));

        $resp->assertOk();
        $rows = collect($resp->json('data.rows'))->keyBy('key');
        $this->assertEquals(150.0, $rows['cash']['total']);
        $this->assertEquals(30.0, $rows['bit']['total']);
        $this->assertEquals(180.0, $resp->json('data.total'));
    }

    public function test_payments_slug_scopes_to_one_record_type(): void
    {
        [$tenant, $admin] = $this->admin('pl-widget-scope');
        app()->instance('current_tenant_id', $tenant->id);
        $invoices = RecordType::create(['tenant_id' => $tenant->id, 'slug' => 'invoices', 'label' => 'חשבוניות', 'position' => 0, 'has_payment_lines' => true]);
        $credits  = RecordType::create(['tenant_id' => $tenant->id, 'slug' => 'credits', 'label' => 'זיכויים', 'position' => 1, 'has_payment_lines' => true]);
        $r1 = Record::create(['tenant_id' => $tenant->id, 'record_type_id' => $invoices->id, 'data' => []]);
        $r2 = Record::create(['tenant_id' => $tenant->id, 'record_type_id' => $credits->id, 'data' => []]);
        RecordPaymentLine::create(['tenant_id' => $tenant->id, 'record_id' => $r1->id, 'payment_type' => 'cash', 'amount' => 100, 'position' => 0]);
        RecordPaymentLine::create(['tenant_id' => $tenant->id, 'record_id' => $r2->id, 'payment_type' => 'cash', 'amount' => 999, 'position' => 0]);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => 'pl-widget-scope'])
            ->getJson('/api/dashboard/widget-data?' . http_build_query([
                'entity' => 'payments:invoices', 'valueField' => 'amount', 'aggregation' => 'sum',
            ]));

        $resp->assertOk();
        $this->assertEquals(100.0, $resp->json('data.total'));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && php artisan test --filter=PaymentLineWidgetTest`
Expected: FAIL — `Unknown entity 'payments:all'` (422 from `resolveDescriptor` returning null → `InvalidArgumentException`).

- [ ] **Step 3: Add `buildPaymentDescriptor()` and wire it into `resolveDescriptor()`**

In `backend/app/Services/Reporting/WidgetDataService.php`, add `use App\Models\RecordPaymentLine;` to the imports, then modify `resolveDescriptor()`:
```php
    private function resolveDescriptor(string $entity): ?array
    {
        if (str_starts_with($entity, 'payments:')) {
            $slug = substr($entity, 9);

            return $this->buildPaymentDescriptor($slug === 'all' ? null : $slug);
        }

        if (str_starts_with($entity, 'record:')) {
            return $this->buildRecordDescriptor(substr($entity, 7));
        }

        return EntityDescriptor::for($entity);
    }
```

Add the new method right after `buildRecordDescriptor()` (after line 306):
```php
    /**
     * Builds an EntityDescriptor-shaped array over record_payment_lines,
     * joined to record_types for the tenant filter. $slug === null aggregates
     * across every record type flagged has_payment_lines for this tenant
     * (entity key "payments:all"); a slug scopes to one type ("payments:<slug>").
     * Unlike buildRecordDescriptor(), payment_type/amount are real columns —
     * jsonOnly is false, so columnExpr() emits plain column references.
     *
     * @return array<string, mixed>|null null when a given slug doesn't resolve
     *                                    to a has_payment_lines type for this tenant
     */
    public function buildPaymentDescriptor(?string $slug): ?array
    {
        $tenantId = app('current_tenant_id');

        $typesQuery = RecordType::where('tenant_id', $tenantId)->where('has_payment_lines', true);
        if ($slug !== null) {
            $typesQuery->where('slug', $slug);
        }
        $recordTypeIds = $typesQuery->pluck('id');

        if ($recordTypeIds->isEmpty()) {
            return null;
        }

        $label = $slug === null
            ? 'תשלומים — הכל'
            : 'תשלומים — ' . (RecordType::where('tenant_id', $tenantId)->where('slug', $slug)->value('label') ?? $slug);

        return [
            'label'        => $label,
            'model'        => RecordPaymentLine::class,
            'table'        => 'record_payment_lines',
            'ownerColumn'  => null,
            'jsonColumn'   => null,
            'jsonOnly'     => false,
            'recordTypeIdsIn' => $recordTypeIds->all(),
            'valueFields'  => ['amount' => ['label' => 'סכום', 'type' => 'number']],
            'groupFields'  => [
                'payment_type' => [
                    'label'   => 'סוג תשלום',
                    'type'    => 'enum',
                    'options' => RecordPaymentLine::PAYMENT_TYPES,
                ],
                'paid_at' => ['label' => 'תאריך תשלום', 'type' => 'date'],
                'created_at' => ['label' => 'נוצר בתאריך', 'type' => 'date'],
            ],
            'filterFields' => [
                'payment_type' => [
                    'label'   => 'סוג תשלום',
                    'type'    => 'enum',
                    'options' => RecordPaymentLine::PAYMENT_TYPES,
                ],
            ],
            'dateFields'   => ['paid_at' => 'תאריך תשלום', 'created_at' => 'נוצר בתאריך'],
        ];
    }
```

`aggregate()` (line 49-51) currently applies `where('record_type_id', ...)` when `$descriptor['recordTypeId']` is set — that key doesn't exist on the payments descriptor (it uses `recordTypeIdsIn` instead, a list, since "all" can span several record types). Add a second branch right after it:
```php
        if (isset($descriptor['recordTypeId'])) {
            $query->where('record_type_id', $descriptor['recordTypeId']);
        }
        if (isset($descriptor['recordTypeIdsIn'])) {
            $query->join('records', 'records.id', '=', 'record_payment_lines.record_id')
                ->whereIn('records.record_type_id', $descriptor['recordTypeIdsIn'])
                ->select('record_payment_lines.*');
        }
```

- [ ] **Step 4: Advertise `payments:*` entities in `WidgetController::fields()`**

In `backend/app/Http/Controllers/WidgetController.php`, add `use App\Models\RecordPaymentLine;` (not strictly needed, `$service->buildPaymentDescriptor()` is enough) and insert this block right after the `record:<slug>` loop (after line 61, before `$dateOperators`):
```php
        // Payment-lines pseudo-entities — "all invoice types combined" plus one
        // per record type flagged has_payment_lines, so "by payment type"
        // breakdowns are buildable the same generic way as any other entity.
        $allPayments = $service->buildPaymentDescriptor(null);
        if ($allPayments !== null) {
            $entities[]            = ['key' => 'payments:all', 'label' => $allPayments['label']];
            $fields['payments:all'] = [
                'valueFields'  => $allPayments['valueFields'],
                'groupFields'  => $allPayments['groupFields'],
                'filterFields' => $allPayments['filterFields'],
                'dateFields'   => $allPayments['dateFields'],
            ];

            foreach ($recordTypes->where('has_payment_lines', true) as $rt) {
                $d = $service->buildPaymentDescriptor($rt->slug);
                if ($d === null) {
                    continue;
                }
                $key = "payments:{$rt->slug}";
                $entities[]   = ['key' => $key, 'label' => $d['label']];
                $fields[$key] = [
                    'valueFields'  => $d['valueFields'],
                    'groupFields'  => $d['groupFields'],
                    'filterFields' => $d['filterFields'],
                    'dateFields'   => $d['dateFields'],
                ];
            }
        }
```
Note: `$recordTypes` is already fetched at line 47 (`RecordType::where('tenant_id', ...)->orderBy('position')->get()`) — this reuses it rather than re-querying.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=PaymentLineWidgetTest`
Expected: PASS (3 tests)

Then run the full backend suite to check nothing broke:
Run: `cd backend && php artisan test`
Expected: PASS (all tests, including the existing `RecordFilterTest` and widget tests)

- [ ] **Step 6: Commit**

```bash
git add backend/app/Services/Reporting/WidgetDataService.php backend/app/Http/Controllers/WidgetController.php \
        backend/tests/Feature/PaymentLineWidgetTest.php
git commit -m "feat: payments:all / payments:<slug> widget-builder pseudo-entity"
```

---

### Task 4: Frontend — payment-lines API client + RecordsPage mini-table

**Files:**
- Create: `frontend/src/api/paymentLines.js`
- Create: `frontend/src/constants/paymentTypes.js`
- Modify: `frontend/src/pages/records/RecordsPage.jsx`

**Interfaces:**
- Consumes: routes from Task 2 (`GET/POST /record-types/{typeId}/records/{recordId}/payment-lines`, `PUT/DELETE .../payment-lines/{id}`), `RecordType.has_payment_lines` (already present on every object `recordTypesApi.list()` returns per Task 1's new column — no new fetch needed, confirmed against `RecordTypeController::index()`'s unfiltered `RecordType::withCount('records')->get()`).
- Produces: `paymentLinesApi.{list,create,update,destroy}`, `PAYMENT_TYPES` (array of `{id, label}` matching `RecordPaymentLine::PAYMENT_TYPES` keys/labels exactly — kept in sync by hand since the enum is hardcoded per-side, not fetched).

- [ ] **Step 1: Create the API client and shared constant**

`frontend/src/api/paymentLines.js`:
```js
import client from './client'

export const paymentLinesApi = {
  list:    (typeId, recordId)        => client.get(`/record-types/${typeId}/records/${recordId}/payment-lines`),
  create:  (typeId, recordId, data)  => client.post(`/record-types/${typeId}/records/${recordId}/payment-lines`, data),
  update:  (typeId, recordId, id, data) => client.put(`/record-types/${typeId}/records/${recordId}/payment-lines/${id}`, data),
  destroy: (typeId, recordId, id)    => client.delete(`/record-types/${typeId}/records/${recordId}/payment-lines/${id}`),
}
```

`frontend/src/constants/paymentTypes.js`:
```js
// Mirrors RecordPaymentLine::PAYMENT_TYPES in backend/app/Models/RecordPaymentLine.php —
// hardcoded on both sides since the enum is not tenant-configurable.
export const PAYMENT_TYPES = [
  { id: 'bit',        label: 'Bit' },
  { id: 'amex',       label: 'אמריקן אקספרס' },
  { id: 'transfer',   label: 'העברה' },
  { id: 'visa_leumi', label: 'ויזה לאומי' },
  { id: 'mastercard', label: 'מאסטרקארד' },
  { id: 'cash',       label: 'מזומן' },
]
```

- [ ] **Step 2: Add the payment-lines panel to `RecordsPage.jsx`'s edit modal**

Payment lines belong to an existing `Record` row (they're a child resource keyed by `record_id`), so the panel only renders in edit mode (`editing !== null`) — a not-yet-saved draft record has no id to attach lines to. Modify `frontend/src/pages/records/RecordsPage.jsx`:

Add the import (next to the `customFieldsApi` import, line 5):
```js
import { paymentLinesApi } from '../../api/paymentLines'
import { PAYMENT_TYPES } from '../../constants/paymentTypes'
```

Add a query + mutations, right after the `deleteRecord` mutation (after line 90, before `const deleteAll = ...`):
```js
  const { data: paymentLines = [] } = useQuery({
    queryKey: ['payment-lines', slug, editing?.id],
    queryFn:  () => paymentLinesApi.list(type.id, editing.id).then(r => r.data.data),
    enabled: !!type && !!editing && !!type.has_payment_lines,
  })
  const [lineWarning, setLineWarning] = useState('')
  const invalidateLines = () => qc.invalidateQueries({ queryKey: ['payment-lines', slug, editing?.id] })

  const createLine = useMutation({
    mutationFn: (d) => paymentLinesApi.create(type.id, editing.id, d),
    onSuccess:  (res) => { invalidateLines(); setLineWarning(res.data.warning ?? '') },
  })
  const updateLine = useMutation({
    mutationFn: ({ id, d }) => paymentLinesApi.update(type.id, editing.id, id, d),
    onSuccess:  (res) => { invalidateLines(); setLineWarning(res.data.warning ?? '') },
  })
  const deleteLine = useMutation({
    mutationFn: (id) => paymentLinesApi.destroy(type.id, editing.id, id),
    onSuccess:  (res) => { invalidateLines(); setLineWarning(res.data.warning ?? '') },
  })
```

Reset `lineWarning` in `openEdit`/`closeModal` (modify lines 96-97):
```js
  const openEdit = (r) => { setEditing(r); setForm(r.data ?? {}); setError(''); setLineWarning(''); setModal(true) }
  const closeModal = () => { setModal(false); setEditing(null); setForm({}); setError(''); setLineWarning('') }
```

Insert the panel into the modal's form, right after the fields `<div className="grid grid-cols-2 gap-3">...</div>` block closes and before the submit-buttons `<div className="flex gap-2 pt-1">` (i.e. between lines 278 and 279):
```jsx
              {editing && type?.has_payment_lines && (
                <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">שורות תשלום</h3>
                    <button type="button"
                      onClick={() => createLine.mutate({ payment_type: PAYMENT_TYPES[0].id, amount: 0 })}
                      className="text-xs text-[#2398c2] hover:underline">+ הוסף שורה</button>
                  </div>
                  {lineWarning && (
                    <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs px-3 py-2 rounded-lg mb-2">
                      {lineWarning}
                    </div>
                  )}
                  <div className="space-y-2">
                    {paymentLines.map(line => (
                      <div key={line.id} className="flex items-center gap-2">
                        <select value={line.payment_type}
                          onChange={e => updateLine.mutate({ id: line.id, d: { payment_type: e.target.value } })}
                          className={INPUT + ' flex-1'}>
                          {PAYMENT_TYPES.map(pt => <option key={pt.id} value={pt.id}>{pt.label}</option>)}
                        </select>
                        <input type="number" step="0.01" value={line.amount}
                          onChange={e => updateLine.mutate({ id: line.id, d: { amount: e.target.value } })}
                          className={INPUT + ' w-28'} dir="ltr" />
                        <input type="date" value={line.paid_at ?? ''}
                          onChange={e => updateLine.mutate({ id: line.id, d: { paid_at: e.target.value || null } })}
                          className={INPUT + ' w-40'} dir="ltr" />
                        <button type="button" onClick={() => deleteLine.mutate(line.id)}
                          className="text-gray-300 dark:text-gray-600 hover:text-red-500 text-lg leading-none">×</button>
                      </div>
                    ))}
                    {paymentLines.length === 0 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">אין שורות תשלום עדיין</p>
                    )}
                  </div>
                </div>
              )}
```

- [ ] **Step 3: Run the frontend test suite to check nothing broke**

Run: `cd frontend && npm run test -- --run`
Expected: PASS (no existing test touches `RecordsPage.jsx` or the new files; this is a regression check, not new coverage — the repo has no component-render tests for page-level components to mirror).

- [ ] **Step 4: Manual verification**

Start the dev server and confirm in browser: create a record type with `has_payment_lines` (via Task 5's Settings toggle — do this step after Task 5 lands, or temporarily flip the flag directly in the DB for a quick check now), open an existing record, add/edit/remove payment lines, confirm the amber warning banner appears when the line total doesn't match the record's configured amount field.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/paymentLines.js frontend/src/constants/paymentTypes.js frontend/src/pages/records/RecordsPage.jsx
git commit -m "feat: payment-lines mini-table on the record edit view"
```

---

### Task 5: Frontend — Settings toggle + edit-type modal

**Files:**
- Modify: `frontend/src/api/recordTypes.js`
- Modify: `frontend/src/pages/settings/SettingsPage.jsx`

**Interfaces:**
- Consumes: `PUT /record-types/{id}` (already exists, `RecordTypeController::update()` — Task 1's new fillable columns make it accept `has_payment_lines`/`has_payment_lines_amount_field` with no backend change needed).
- Produces: an edit affordance on each custom-type tab (previously create-only) that opens the same-shaped modal pre-filled, with two new controls: the `has_payment_lines` checkbox and a conditional amount-field `<select>` sourced from that type's own `customFieldsApi.list(slug)` fields.

- [ ] **Step 1: Extend `recordTypesApi` payload shape (no signature change needed)**

`recordTypesApi.create`/`update` in `frontend/src/api/recordTypes.js` already forward an arbitrary `data` object (`client.post('/record-types', data)` / `client.put(\`/record-types/${id}\`, data)`) — no changes required here; confirm by reading the file (already read, lines 3-8 above). Skip to Step 2.

- [ ] **Step 2: Add edit-mode state and a companion "edit" affordance to the type tab**

In `frontend/src/pages/settings/SettingsPage.jsx`, inside `LabelsTab()`:

Replace the `showTypeModal`/`typeDraft` state (lines 1169-1171) with edit-aware versions:
```js
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [editingType, setEditingType] = useState(null) // RecordType being edited, or null for create
  const [typeDraft, setTypeDraft]   = useState({ label: '', label_singular: '', icon: RECORD_TYPE_ICONS[0], has_payment_lines: false, has_payment_lines_amount_field: '' })
  const [typeError, setTypeError]  = useState('')
```

Fetch the amount-field options for the type being edited (add right after the `recordTypes` query, ~line 1176):
```js
  const { data: editingTypeFields = [] } = useQuery({
    queryKey: ['custom-fields', editingType?.slug],
    queryFn:  () => customFieldsApi.list(editingType.slug).then(r => r.data.data),
    enabled:  !!editingType,
  })
```

Replace `createType` with a mutation that branches create vs. update, and update the modal-close reset (lines 1183-1193):
```js
  const saveType = useMutation({
    mutationFn: (d) => editingType ? recordTypesApi.update(editingType.id, d) : recordTypesApi.create(d),
    onSuccess:  (res) => {
      qc.invalidateQueries({ queryKey: ['record-types'] })
      closeTypeModal()
      if (!editingType) setEntity(res.data.data.slug)
    },
    onError: (err) => setTypeError(err.response?.data?.message ?? 'שגיאה בשמירת סוג הרשומה'),
  })

  function closeTypeModal() {
    setShowTypeModal(false)
    setEditingType(null)
    setTypeDraft({ label: '', label_singular: '', icon: RECORD_TYPE_ICONS[0], has_payment_lines: false, has_payment_lines_amount_field: '' })
    setTypeError('')
  }

  function openEditType(rt) {
    setEditingType(rt)
    setTypeDraft({
      label: rt.label, label_singular: rt.label_singular ?? '', icon: rt.icon ?? RECORD_TYPE_ICONS[0],
      has_payment_lines: !!rt.has_payment_lines, has_payment_lines_amount_field: rt.has_payment_lines_amount_field ?? '',
    })
    setTypeError('')
    setShowTypeModal(true)
  }
```

Replace `handleCreateType` (lines 1203-1212):
```js
  const handleSaveType = (e) => {
    e.preventDefault()
    setTypeError('')
    if (!typeDraft.label.trim()) return
    saveType.mutate({
      label: typeDraft.label.trim(),
      label_singular: typeDraft.label_singular.trim() || undefined,
      icon: typeDraft.icon,
      has_payment_lines: typeDraft.has_payment_lines,
      has_payment_lines_amount_field: typeDraft.has_payment_lines ? (typeDraft.has_payment_lines_amount_field || null) : null,
    })
  }
```

Add an edit affordance next to each custom-type tab's delete `×` (modify the tab button block, lines 1305-1323) — an "✎" appears alongside the existing delete `×`, both only for `en.custom`:
```jsx
          {allEntities.map(en => (
            <button key={en.id} onClick={() => setEntity(en.id)}
              className={`group/tab relative px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                entity === en.id
                  ? 'bg-white dark:bg-gray-800 text-[#2398c2] shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              {en.label}
              {en.custom && canManage && (
                <span
                  onClick={(e) => { e.stopPropagation(); openEditType(recordTypes.find(rt => rt.id === en.recordTypeId)) }}
                  className="mr-1.5 inline-flex opacity-0 group-hover/tab:opacity-100 text-gray-300 hover:text-[#2398c2] transition-opacity"
                  title="ערוך סוג רשומה">✎</span>
              )}
              {en.custom && canManage && (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`למחוק את סוג הרשומה "${en.label}"? כל הרשומות והשדות שלו יימחקו לצמיתות.`)) deleteType.mutate(en.recordTypeId)
                  }}
                  className="mr-1.5 inline-flex opacity-0 group-hover/tab:opacity-100 text-gray-300 hover:text-red-500 transition-opacity"
                  title="מחק סוג רשומה">×</span>
              )}
            </button>
          ))}
```

Update the "+ סוג רשומה" button (line 1326-1330) to go through `openEditType`-compatible open (create mode is just `editingType === null`, already the default), so only wire `setShowTypeModal(true)` unchanged there but clear via `closeTypeModal`'s shape — no change needed since `typeError`/`showTypeModal` reset already happens; leave as-is.

- [ ] **Step 3: Add the checkbox + amount-field select to the modal, and rename it to be edit-aware**

Modify the "Create record type modal" block (lines 1524-1578): change the header to reflect edit mode, `onSubmit`/`onClick` handlers to the renamed functions, and insert the two new controls before the closing help text `<p>`:
```jsx
      {/* Create/edit record type modal */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl" onClick={closeTypeModal}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{editingType ? 'עריכת סוג רשומה' : 'סוג רשומה חדש'}</h2>
              <button onClick={closeTypeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleSaveType} className="px-6 py-4 space-y-4">
              {typeError && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm px-3 py-2 rounded-lg">
                  {typeError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם (רבים) <span className="text-red-500">*</span></label>
                <input required value={typeDraft.label} onChange={e => setTypeDraft(d => ({ ...d, label: e.target.value }))}
                  placeholder="לדוגמה: חשבוניות מס, קבלות, רכבים..." dir="auto" lang="he"
                  className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שם (יחיד)</label>
                <input value={typeDraft.label_singular} onChange={e => setTypeDraft(d => ({ ...d, label_singular: e.target.value }))}
                  placeholder="לדוגמה: חשבונית מס, קבלה, רכב..." dir="auto" lang="he"
                  className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">אייקון</label>
                <div className="grid grid-cols-6 gap-2">
                  {RECORD_TYPE_ICONS.map(icon => (
                    <button key={icon} type="button" onClick={() => setTypeDraft(d => ({ ...d, icon }))}
                      className={`text-lg py-2 rounded-lg border transition-colors ${
                        typeDraft.icon === icon
                          ? 'border-[#2398c2] bg-[#2398c2]/10'
                          : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              {editingType && (
                <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none mb-2">
                    <input type="checkbox" checked={typeDraft.has_payment_lines}
                      onChange={e => setTypeDraft(d => ({ ...d, has_payment_lines: e.target.checked }))}
                      className="rounded border-gray-300 accent-[#2398c2]" />
                    מכיל שורות תשלום (Bit / אשראי / מזומן וכו')
                  </label>
                  {typeDraft.has_payment_lines && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">שדה סכום החשבונית (לאזהרת התאמה)</label>
                      <select value={typeDraft.has_payment_lines_amount_field}
                        onChange={e => setTypeDraft(d => ({ ...d, has_payment_lines_amount_field: e.target.value }))}
                        className={INPUT}>
                        <option value="">בלי אזהרה</option>
                        {editingTypeFields.filter(f => f.field_type === 'number').map(f => (
                          <option key={f.name} value={f.name}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {editingType ? 'שינויים כאן חלים מיד על כל הרשומות מסוג זה.' : 'לאחר היצירה תוכל להוסיף שדות משלך (בדיוק כמו ברשומות אחרות) ותופיע קישור בסרגל הניווט העליון.'}
              </p>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saveType.isPending || !typeDraft.label.trim()}
                  className="flex-1 bg-[#2398c2] hover:bg-[#1d7fa3] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
                  {saveType.isPending ? 'שומר...' : editingType ? 'שמור שינויים' : 'צור סוג רשומה'}
                </button>
                <button type="button" onClick={closeTypeModal}
                  className="px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
```

The checkbox/amount-field pair is edit-only (`editingType &&`) — a brand-new type has no `CustomFieldDefinition` rows yet to pick an amount field from, so it's set on a second visit (edit) once fields exist, consistent with the existing "add fields after creation" flow described in the modal's own help text.

- [ ] **Step 4: Run the frontend test suite to check nothing broke**

Run: `cd frontend && npm run test -- --run`
Expected: PASS

- [ ] **Step 5: Manual verification**

In the browser: Settings → create a record type, add a numeric "amount" field to it via the existing field builder, click the new ✎ edit affordance on its tab, check "מכיל שורות תשלום", pick the amount field, save, confirm `RecordsPage` (Task 4) now shows the payment-lines panel for that type's records.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/settings/SettingsPage.jsx
git commit -m "feat: edit-type modal with has_payment_lines toggle and amount-field picker"
```

---

### Task 6: Deploy — production migration + Sonia's board

This task runs against the live production tenant (sonia-crm, tenant_id=2, sonia-crm.duckdns.org) — no new code, verification only. Follow the project's existing deploy path for this environment (SSH + `php artisan migrate` — same mechanism used for every prior `SCHEMA_DB/` migration this session's git history references).

- [ ] **Step 1: Deploy the branch and run migrations**

SSH to the production host, pull the branch, run:
```bash
cd /path/to/backend && php artisan migrate --force
```
Confirm no errors and that `record_types.has_payment_lines` / `record_payment_lines` exist:
```bash
php artisan tinker --execute="dd(Schema::hasColumn('record_types','has_payment_lines'), Schema::hasTable('record_payment_lines'));"
```
Expected: both `true`.

- [ ] **Step 2: Flag Sonia's 4 invoice types**

Log in to sonia-crm.duckdns.org as an admin, go to Settings → the labels/record-types tab, and for each of the 4 invoice record types (rt_rdhst4 חשבוניות עסקה, rt_8az626 חשבוניות זיכוי, rt_5h0wrx חשבוניות מס, rt_7vjqxv חשבוניות מס קבלה) click the new ✎ edit affordance, check "מכיל שורות תשלום", and pick that type's invoice-total field as the amount field (whichever `CustomFieldDefinition` on that type represents the invoice's total — inspect that type's field list in the same Settings tab first if the name isn't obvious from the existing widgets built earlier this session).

- [ ] **Step 3: Verify the widget-builder entity appears**

Open the "הכנסות" board (id=5), add a new widget, and confirm the entity dropdown now lists "תשלומים — הכל" (and one "תשלומים — <type>" per flagged type). Select it, set שדה להצגה to "סוג תשלום", ערכים to "סכום" / "סכום" (sum), title it "הכנסות לפי סוג תשלום", save.

- [ ] **Step 4: Confirm it renders**

Screenshot or visually confirm the new widget renders on the board without errors (it will show zero/empty data until invoices with payment lines are entered going forward — expected, per the spec's no-backfill decision).

- [ ] **Step 5: No commit** — this task is a production deploy + manual UI action, not a code change.

---

## Self-Review Notes

- **Spec coverage:** all 5 spec sections have a task — schema (Task 1), backend CRUD (Task 2), widget pseudo-entity (Task 3), RecordsPage UI (Task 4), Settings toggle (Task 5), live board (Task 6).
- **Type consistency checked:** `RecordPaymentLine::PAYMENT_TYPES` keys (`bit/amex/transfer/visa_leumi/mastercard/cash`) match `frontend/src/constants/paymentTypes.js` exactly; `paymentLinesApi` method names/params match every call site in Task 4; `buildPaymentDescriptor(?string $slug)` signature matches both call sites (`resolveDescriptor()` and `WidgetController::fields()`); entity keys `payments:all` / `payments:<slug>` used consistently in tests, `resolveDescriptor()`, and `WidgetController::fields()`.
- **AddWidgetModal.jsx requires zero code changes** — confirmed by reading it in full: the entity `<select>` and every field-driven control already iterate `meta.entities`/`meta.fields` generically, with no `record:`-specific special-casing to extend.
- **No placeholders** — every step has real code, no TBD/TODO.
