<?php

namespace Tests\Feature;

use App\Models\DashboardBoard;
use App\Models\DashboardWidget;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DashboardBoardModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_board_and_widgets_can_be_created_and_related(): void
    {
        $tenant = Tenant::create(['name' => 'Board Tenant', 'subdomain' => 'boardt', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        $user = User::create([
            'tenant_id' => $tenant->id, 'name' => 'Admin',
            'email' => 'admin@boardt.test', 'password' => Hash::make('password'), 'role' => 'admin',
        ]);

        $board = DashboardBoard::create([
            'tenant_id' => $tenant->id, 'user_id' => $user->id, 'name' => 'ניתוח לידים', 'position' => 0,
        ]);

        $widgetConfig = ['type' => 'bar', 'entity' => 'lead', 'title' => 'לפי מקור', 'displayField' => 'source'];
        DashboardWidget::create([
            'tenant_id' => $tenant->id, 'board_id' => $board->id, 'config' => $widgetConfig, 'position' => 0,
        ]);

        $this->assertSame($user->id, $board->user->id);
        $this->assertCount(1, $board->widgets);
        $this->assertSame('bar', $board->widgets->first()->config['type']);
    }

    public function test_widgets_are_ordered_by_position(): void
    {
        $tenant = Tenant::create(['name' => 'Board Tenant 2', 'subdomain' => 'boardt2', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create([
            'tenant_id' => $tenant->id, 'name' => 'Admin',
            'email' => 'admin@boardt2.test', 'password' => Hash::make('password'), 'role' => 'admin',
        ]);
        $board = DashboardBoard::create(['tenant_id' => $tenant->id, 'user_id' => $user->id, 'name' => 'לוח', 'position' => 0]);

        DashboardWidget::create(['tenant_id' => $tenant->id, 'board_id' => $board->id, 'config' => ['title' => 'שני'], 'position' => 1]);
        DashboardWidget::create(['tenant_id' => $tenant->id, 'board_id' => $board->id, 'config' => ['title' => 'ראשון'], 'position' => 0]);

        $titles = $board->fresh()->widgets->pluck('config.title')->all();
        $this->assertSame(['ראשון', 'שני'], $titles);
    }

    public function test_deleting_board_cascades_to_widgets(): void
    {
        $tenant = Tenant::create(['name' => 'Board Tenant 3', 'subdomain' => 'boardt3', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create([
            'tenant_id' => $tenant->id, 'name' => 'Admin',
            'email' => 'admin@boardt3.test', 'password' => Hash::make('password'), 'role' => 'admin',
        ]);
        $board  = DashboardBoard::create(['tenant_id' => $tenant->id, 'user_id' => $user->id, 'name' => 'לוח', 'position' => 0]);
        $widget = DashboardWidget::create(['tenant_id' => $tenant->id, 'board_id' => $board->id, 'config' => [], 'position' => 0]);

        $board->delete();

        $this->assertDatabaseMissing('dashboard_widgets', ['id' => $widget->id]);
    }
}
