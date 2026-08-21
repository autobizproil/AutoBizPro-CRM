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

    public function test_soft_deleted_records_payment_lines_excluded_from_totals(): void
    {
        [$tenant, $admin] = $this->admin('pl-widget-softdel');
        app()->instance('current_tenant_id', $tenant->id);
        $type = RecordType::create(['tenant_id' => $tenant->id, 'slug' => 'invoices', 'label' => 'חשבוניות', 'position' => 0, 'has_payment_lines' => true]);
        $kept = Record::create(['tenant_id' => $tenant->id, 'record_type_id' => $type->id, 'data' => []]);
        $deleted = Record::create(['tenant_id' => $tenant->id, 'record_type_id' => $type->id, 'data' => []]);
        RecordPaymentLine::create(['tenant_id' => $tenant->id, 'record_id' => $kept->id, 'payment_type' => 'cash', 'amount' => 100, 'position' => 0]);
        RecordPaymentLine::create(['tenant_id' => $tenant->id, 'record_id' => $deleted->id, 'payment_type' => 'cash', 'amount' => 999, 'position' => 0]);
        $deleted->delete();

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => 'pl-widget-softdel'])
            ->getJson('/api/dashboard/widget-data?' . http_build_query([
                'entity' => 'payments:all', 'valueField' => 'amount', 'aggregation' => 'sum',
            ]));

        $resp->assertOk();
        $this->assertEquals(100.0, $resp->json('data.total'));
    }

    public function test_payments_slug_without_has_payment_lines_is_unknown_entity(): void
    {
        [$tenant, $admin] = $this->admin('pl-widget-noflag');
        app()->instance('current_tenant_id', $tenant->id);
        RecordType::create(['tenant_id' => $tenant->id, 'slug' => 'notes', 'label' => 'הערות', 'position' => 0, 'has_payment_lines' => false]);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => 'pl-widget-noflag'])
            ->getJson('/api/dashboard/widget-data?' . http_build_query([
                'entity' => 'payments:notes', 'valueField' => 'amount', 'aggregation' => 'sum',
            ]));

        $resp->assertStatus(422);
        $this->assertStringContainsString('Unknown entity', $resp->json('message'));
    }
}
