<?php

namespace Tests\Feature;

use App\Models\DashboardBoard;
use App\Models\DashboardWidget;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DashboardBoardControllerTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private User $userA;
    private User $userB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'DB Tenant', 'subdomain' => 'dbctrl', 'status' => 'active']);
        app()->instance('current_tenant_id', $this->tenant->id);

        $this->userA = User::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'email' => 'a@dbctrl.test', 'password' => Hash::make('x'), 'role' => 'admin']);
        $this->userB = User::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'email' => 'b@dbctrl.test', 'password' => Hash::make('x'), 'role' => 'admin']);
    }

    private function asUser(User $user)
    {
        return $this->actingAs($user)->withHeaders(['X-Tenant' => 'dbctrl']);
    }

    public function test_index_returns_only_own_boards_with_nested_widgets(): void
    {
        $mine   = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שלי', 'position' => 0]);
        DashboardWidget::create(['tenant_id' => $this->tenant->id, 'board_id' => $mine->id, 'config' => ['title' => 'w1'], 'position' => 0]);
        DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userB->id, 'name' => 'לא שלי', 'position' => 0]);

        $resp = $this->asUser($this->userA)->getJson('/api/dashboards');

        $resp->assertOk();
        $names = collect($resp->json('data'))->pluck('name')->all();
        $this->assertSame(['שלי'], $names);
        $this->assertCount(1, $resp->json('data.0.widgets'));
    }

    public function test_store_creates_board_owned_by_current_user(): void
    {
        $resp = $this->asUser($this->userA)->postJson('/api/dashboards', ['name' => 'לוח חדש']);

        $resp->assertCreated();
        $this->assertDatabaseHas('dashboard_boards', ['name' => 'לוח חדש', 'user_id' => $this->userA->id]);
    }

    public function test_update_rejects_non_owner(): void
    {
        $board = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שם', 'position' => 0]);

        $this->asUser($this->userB)->putJson("/api/dashboards/{$board->id}", ['name' => 'גנוב'])
            ->assertStatus(403);
    }

    public function test_update_reorders_board_position(): void
    {
        $board = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שם', 'position' => 0]);

        $this->asUser($this->userA)->putJson("/api/dashboards/{$board->id}", ['position' => 3])
            ->assertOk();

        $this->assertDatabaseHas('dashboard_boards', ['id' => $board->id, 'position' => 3]);
    }

    public function test_destroy_cascades_widgets(): void
    {
        $board  = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שם', 'position' => 0]);
        $widget = DashboardWidget::create(['tenant_id' => $this->tenant->id, 'board_id' => $board->id, 'config' => [], 'position' => 0]);

        $this->asUser($this->userA)->deleteJson("/api/dashboards/{$board->id}")->assertNoContent();

        $this->assertDatabaseMissing('dashboard_boards', ['id' => $board->id]);
        $this->assertDatabaseMissing('dashboard_widgets', ['id' => $widget->id]);
    }

    public function test_store_widget_appends_to_board(): void
    {
        $board = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שם', 'position' => 0]);

        $resp = $this->asUser($this->userA)->postJson("/api/dashboards/{$board->id}/widgets", [
            'config' => ['type' => 'bar', 'entity' => 'lead'],
        ]);

        $resp->assertCreated();
        $this->assertDatabaseHas('dashboard_widgets', ['board_id' => $board->id]);
    }

    public function test_store_widget_rejects_non_owner_board(): void
    {
        $board = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שם', 'position' => 0]);

        $this->asUser($this->userB)->postJson("/api/dashboards/{$board->id}/widgets", ['config' => []])
            ->assertStatus(403);
    }

    public function test_update_widget_replaces_config(): void
    {
        $board  = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שם', 'position' => 0]);
        $widget = DashboardWidget::create(['tenant_id' => $this->tenant->id, 'board_id' => $board->id, 'config' => ['title' => 'ישן'], 'position' => 0]);

        $this->asUser($this->userA)
            ->putJson("/api/dashboards/{$board->id}/widgets/{$widget->id}", ['config' => ['title' => 'חדש']])
            ->assertOk();

        $this->assertSame('חדש', $widget->fresh()->config['title']);
    }

    public function test_destroy_widget(): void
    {
        $board  = DashboardBoard::create(['tenant_id' => $this->tenant->id, 'user_id' => $this->userA->id, 'name' => 'שם', 'position' => 0]);
        $widget = DashboardWidget::create(['tenant_id' => $this->tenant->id, 'board_id' => $board->id, 'config' => [], 'position' => 0]);

        $this->asUser($this->userA)->deleteJson("/api/dashboards/{$board->id}/widgets/{$widget->id}")->assertNoContent();

        $this->assertDatabaseMissing('dashboard_widgets', ['id' => $widget->id]);
    }

    public function test_requires_authentication(): void
    {
        $this->getJson('/api/dashboards')->assertStatus(401);
    }
}
