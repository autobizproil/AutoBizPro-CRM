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
