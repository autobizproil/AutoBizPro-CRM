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
