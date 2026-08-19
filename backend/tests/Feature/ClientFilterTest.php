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

    public function test_or_conditions_apply_as_an_or_group(): void
    {
        [$tenant, $admin, $sub] = $this->admin('client-or');
        app()->instance('current_tenant_id', $tenant->id);
        Client::create(['tenant_id' => $tenant->id, 'name' => 'Alice', 'source' => 'referral', 'company' => 'Acme']);
        Client::create(['tenant_id' => $tenant->id, 'name' => 'Bob', 'source' => 'web', 'company' => 'Other']);
        Client::create(['tenant_id' => $tenant->id, 'name' => 'Carl', 'source' => 'phone', 'company' => 'Third']);

        // Two OR'd conditions -> union of both matches (Alice via source, Bob via company).
        // Before this fix, orConditions was never read by the controller at all, so this
        // param would have had zero effect on the result.
        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/clients?' . http_build_query([
                'orConditions' => json_encode([
                    ['field' => 'source', 'operator' => 'equals', 'value' => 'referral'],
                    ['field' => 'company', 'operator' => 'equals', 'value' => 'Other'],
                ]),
            ]));

        $resp->assertOk();
        $names = collect($resp->json('data.data'))->pluck('name')->sort()->values()->all();
        $this->assertSame(['Alice', 'Bob'], $names);
    }

    public function test_date_field_targets_a_non_default_whitelisted_column(): void
    {
        [$tenant, $admin, $sub] = $this->admin('client-datefield');
        app()->instance('current_tenant_id', $tenant->id);

        $old = Client::create(['tenant_id' => $tenant->id, 'name' => 'OldUpdated']);
        $old->updated_at = now()->subDays(30);
        $old->saveQuietly();
        Client::create(['tenant_id' => $tenant->id, 'name' => 'RecentUpdated']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/clients?' . http_build_query([
                'date_field' => 'updated_at',
                'date_from'  => now()->subDay()->toIso8601String(),
            ]));

        $resp->assertOk();
        $names = collect($resp->json('data.data'))->pluck('name')->all();
        $this->assertSame(['RecentUpdated'], $names);
    }
}
