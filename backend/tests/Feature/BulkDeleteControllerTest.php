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
