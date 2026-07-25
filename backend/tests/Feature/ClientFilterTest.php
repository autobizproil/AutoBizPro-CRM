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
