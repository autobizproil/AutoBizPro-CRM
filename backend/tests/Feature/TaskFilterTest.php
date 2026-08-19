<?php
namespace Tests\Feature;

use App\Models\Task;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class TaskFilterTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $sub): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin']);
        return [$tenant, $admin, $sub];
    }

    public function test_filters_tasks_by_condition(): void
    {
        [$tenant, $admin, $sub] = $this->admin('task-filter');
        app()->instance('current_tenant_id', $tenant->id);
        Task::create(['tenant_id' => $tenant->id, 'title' => 'Call Alice', 'status' => 'open', 'priority' => 'high']);
        Task::create(['tenant_id' => $tenant->id, 'title' => 'Email Bob', 'status' => 'open', 'priority' => 'low']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/tasks?' . http_build_query([
                'conditions' => json_encode([['field' => 'priority', 'operator' => 'equals', 'value' => 'high']]),
            ]));

        $resp->assertOk();
        $data = $resp->json('data');
        $this->assertCount(1, $data);
        $this->assertSame('Call Alice', $data[0]['title']);
    }

    public function test_or_conditions_apply_as_an_or_group(): void
    {
        [$tenant, $admin, $sub] = $this->admin('task-or');
        app()->instance('current_tenant_id', $tenant->id);
        Task::create(['tenant_id' => $tenant->id, 'title' => 'Call Alice', 'status' => 'open', 'priority' => 'high']);
        Task::create(['tenant_id' => $tenant->id, 'title' => 'Email Bob', 'status' => 'done', 'priority' => 'low']);
        Task::create(['tenant_id' => $tenant->id, 'title' => 'Fax Carl', 'status' => 'open', 'priority' => 'low']);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/tasks?' . http_build_query([
                'orConditions' => json_encode([
                    ['field' => 'priority', 'operator' => 'equals', 'value' => 'high'],
                    ['field' => 'status', 'operator' => 'equals', 'value' => 'done'],
                ]),
            ]));

        $resp->assertOk();
        $titles = collect($resp->json('data'))->pluck('title')->sort()->values()->all();
        $this->assertSame(['Call Alice', 'Email Bob'], $titles);
    }

    public function test_date_field_targets_due_at_instead_of_created_at(): void
    {
        [$tenant, $admin, $sub] = $this->admin('task-datefield');
        app()->instance('current_tenant_id', $tenant->id);

        Task::create(['tenant_id' => $tenant->id, 'title' => 'DueSoon', 'status' => 'open', 'priority' => 'high', 'due_at' => now()->addDay()]);
        Task::create(['tenant_id' => $tenant->id, 'title' => 'DueFar', 'status' => 'open', 'priority' => 'high', 'due_at' => now()->addMonth()]);

        $resp = $this->actingAs($admin)->withHeaders(['X-Tenant' => $sub])
            ->getJson('/api/tasks?' . http_build_query([
                'date_field' => 'due_at',
                'date_to'    => now()->addDays(3)->toIso8601String(),
            ]));

        $resp->assertOk();
        $titles = collect($resp->json('data'))->pluck('title')->all();
        $this->assertSame(['DueSoon'], $titles);
    }
}