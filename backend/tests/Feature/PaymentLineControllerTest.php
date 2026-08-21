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

    private function setupData(): array
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
        [, $admin, $type, $record] = $this->setupData();

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
        [, $admin, $type, $record] = $this->setupData();

        $resp = $this->auth($admin)->postJson(
            "/api/record-types/{$type->id}/records/{$record->id}/payment-lines",
            ['payment_type' => 'cash', 'amount' => 40]
        );

        $resp->assertCreated();
        $this->assertNotNull($resp->json('warning'));
    }

    public function test_rejects_line_on_record_type_without_payment_lines(): void
    {
        [$tenant, $admin] = $this->setupData();
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
        [, $admin, $type, $record] = $this->setupData();

        $resp = $this->auth($admin)->postJson(
            "/api/record-types/{$type->id}/records/{$record->id}/payment-lines",
            ['payment_type' => 'paypal', 'amount' => 10]
        );

        $resp->assertStatus(422);
    }

    public function test_update_and_delete_line(): void
    {
        [, $admin, $type, $record] = $this->setupData();
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
        [, $admin, $type, $record] = $this->setupData();
        $this->auth($admin)->postJson(
            "/api/record-types/{$type->id}/records/{$record->id}/payment-lines",
            ['payment_type' => 'cash', 'amount' => 100]
        );

        $resp = $this->auth($admin)->getJson("/api/record-types/{$type->id}/records/{$record->id}/payment-lines");
        $resp->assertOk();
        $this->assertCount(1, $resp->json('data'));
    }
}
