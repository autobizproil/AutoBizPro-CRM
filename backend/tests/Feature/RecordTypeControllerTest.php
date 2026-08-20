<?php
namespace Tests\Feature;

use App\Models\RecordType;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RecordTypeControllerTest extends TestCase
{
    use RefreshDatabase;

    private function setupData(): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => 'rt-ctrl', 'status' => 'active']);
        $admin  = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => 'a@rt-ctrl.co', 'password' => Hash::make('x'), 'role' => 'admin']);
        app()->instance('current_tenant_id', $tenant->id);
        $type = RecordType::create(['tenant_id' => $tenant->id, 'slug' => 'invoices', 'label' => 'Invoices', 'position' => 0]);

        return [$tenant, $admin, $type];
    }

    private function auth($admin)
    {
        return $this->actingAs($admin)->withHeaders(['X-Tenant' => 'rt-ctrl']);
    }

    public function test_update_persists_has_payment_lines_toggle(): void
    {
        [, $admin, $type] = $this->setupData();

        $this->assertFalse((bool) $type->has_payment_lines);

        $resp = $this->auth($admin)->putJson("/api/record-types/{$type->id}", [
            'has_payment_lines' => true,
            'has_payment_lines_amount_field' => 'amount',
        ]);

        $resp->assertOk();
        $this->assertTrue((bool) $resp->json('data.has_payment_lines'));
        $this->assertSame('amount', $resp->json('data.has_payment_lines_amount_field'));

        $fresh = $type->fresh();
        $this->assertTrue((bool) $fresh->has_payment_lines);
        $this->assertSame('amount', $fresh->has_payment_lines_amount_field);
    }
}
