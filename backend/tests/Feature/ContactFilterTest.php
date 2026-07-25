<?php
namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ContactFilterTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $sub): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        return [$tenant, $admin, $sub];
    }

    public function test_filters_contacts_by_condition(): void
    {
        [$tenant, $admin, $sub] = $this->admin('contact-filter');
        app()->instance('current_tenant_id', $tenant->id);
        Contact::create(['tenant_id' => $tenant->id, 'name' => 'Alice', 'company' => 'Acme']);
        Contact::create(['tenant_id' => $tenant->id, 'name' => 'Bob', 'company' => 'Other']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/contacts?' . http_build_query([
                'conditions' => json_encode([['field' => 'company', 'operator' => 'equals', 'value' => 'Acme']]),
            ]));

        $resp->assertOk();
        $this->assertCount(1, $resp->json('data.data'));
        $this->assertSame('Alice', $resp->json('data.data.0.name'));
    }

    public function test_filters_contacts_by_date_range(): void
    {
        [$tenant, $admin, $sub] = $this->admin('contact-date');
        app()->instance('current_tenant_id', $tenant->id);
        $old = Contact::create(['tenant_id' => $tenant->id, 'name' => 'Old']);
        $old->created_at = now()->subDays(30);
        $old->saveQuietly();
        Contact::create(['tenant_id' => $tenant->id, 'name' => 'New']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/contacts?date_from=' . now()->subDay()->toIso8601String());

        $resp->assertOk();
        $this->assertCount(1, $resp->json('data.data'));
        $this->assertSame('New', $resp->json('data.data.0.name'));
    }
}
