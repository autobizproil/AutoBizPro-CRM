<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\PipelineStage;
use App\Models\RolePermission;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WidgetEndpointsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'name' => 'Widget Tenant', 'subdomain' => 'wep', 'status' => 'active',
        ]);
        app()->instance('current_tenant_id', $this->tenant->id);

        $this->admin = User::create([
            'tenant_id' => $this->tenant->id, 'name' => 'Admin',
            'email' => 'admin@wep.test', 'password' => Hash::make('password'), 'role' => 'admin',
        ]);
    }

    private function asAdmin()
    {
        return $this->actingAs($this->admin)->withHeaders(['X-Tenant' => 'wep']);
    }

    public function test_widget_fields_returns_entities_and_metadata(): void
    {
        $resp = $this->asAdmin()->getJson('/api/dashboard/widget-fields');

        $resp->assertOk();
        $resp->assertJsonStructure([
            'success',
            'data' => [
                'entities'      => ['*' => ['key', 'label']],
                'fields',
                'dateOperators' => ['*' => ['id', 'label', 'needsValue']],
                'aggregations'  => ['*' => ['id', 'label']],
                'lookups'       => ['users', 'stages'],
            ],
        ]);

        $keys = collect($resp->json('data.entities'))->pluck('key')->all();
        $this->assertContains('lead', $keys);
        $this->assertContains('task', $keys);

        $this->assertArrayHasKey('groupFields', $resp->json('data.fields.lead'));
    }

    public function test_widget_fields_includes_tenant_users_and_stages(): void
    {
        PipelineStage::create([
            'tenant_id' => $this->tenant->id, 'name' => 'ליד חדש',
            'color' => '#6366f1', 'position' => 1, 'type' => 'lead',
        ]);

        $resp = $this->asAdmin()->getJson('/api/dashboard/widget-fields');

        $resp->assertOk();
        $this->assertSame('Admin', $resp->json('data.lookups.users.0.name'));
        $this->assertSame('ליד חדש', $resp->json('data.lookups.stages.0.name'));
    }

    public function test_widget_data_groups_by_source(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'source' => 'facebook']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'C', 'source' => 'website']);

        $resp = $this->asAdmin()->getJson('/api/dashboard/widget-data?entity=lead&displayField=source');

        $resp->assertOk();
        $resp->assertJsonStructure(['success', 'data' => ['rows' => ['*' => ['key', 'label', 'color', 'total']], 'total']]);
        $this->assertSame(3, (int) $resp->json('data.total'));
    }

    public function test_widget_data_accepts_json_conditions(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'דני כהן', 'source' => 'match']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'רוני לוי', 'source' => 'nomatch']);

        $conditions = json_encode([['field' => 'name', 'operator' => 'contains', 'value' => 'כהן']]);

        $resp = $this->asAdmin()->getJson(
            '/api/dashboard/widget-data?entity=lead&displayField=source&conditions=' . urlencode($conditions)
        );

        $resp->assertOk();
        $keys = collect($resp->json('data.rows'))->pluck('key')->all();
        $this->assertSame(['match'], $keys);
    }

    public function test_widget_data_or_conditions_reach_the_aggregation(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook', 'status' => 'open']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'source' => 'website', 'status' => 'won']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'C', 'source' => 'referral', 'status' => 'lost']);

        // Without orConditions: no filter at all -> baseline of 3
        $baseline = $this->asAdmin()->getJson('/api/dashboard/widget-data?entity=lead&displayField=source');
        $baseline->assertOk();
        $this->assertSame(3, (int) $baseline->json('data.total'));

        // Two conditions OR'd together (no AND-group) -> union of both matches (A via
        // source, B via status). Before this fix, the controller never read
        // orConditions off the request at all, so this param had zero effect and the
        // baseline (all 3 rows, unfiltered) would have leaked through unchanged.
        $orConditions = json_encode([
            ['field' => 'source', 'operator' => 'equals', 'value' => 'facebook'],
            ['field' => 'status', 'operator' => 'equals', 'value' => 'won'],
        ]);

        $resp = $this->asAdmin()->getJson(
            '/api/dashboard/widget-data?entity=lead&displayField=source&orConditions=' . urlencode($orConditions)
        );

        $resp->assertOk();
        $this->assertSame(2, (int) $resp->json('data.total'));
    }

    public function test_widget_data_group_by_returns_series_keys(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook', 'status' => 'open']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'source' => 'facebook', 'status' => 'won']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'C', 'source' => 'website', 'status' => 'lost']);

        $groupBy = json_encode(['field' => 'status']);

        $resp = $this->asAdmin()->getJson(
            '/api/dashboard/widget-data?entity=lead&displayField=source&groupBy=' . urlencode($groupBy)
        );

        $resp->assertOk();
        $resp->assertJsonStructure(['data' => ['rows', 'seriesKeys']]);
        $seriesKeys = collect($resp->json('data.seriesKeys'))->pluck('key')->all();
        sort($seriesKeys);
        $this->assertSame(['lost', 'open', 'won'], $seriesKeys);
    }

    public function test_widget_data_rejects_unknown_entity(): void
    {
        $resp = $this->asAdmin()->getJson('/api/dashboard/widget-data?entity=invoice');

        $resp->assertStatus(422);
        $resp->assertJson(['success' => false]);
    }

    public function test_widget_data_requires_authentication(): void
    {
        $this->getJson('/api/dashboard/widget-data?entity=lead')->assertStatus(401);
    }

    public function test_agent_without_reports_permission_is_forbidden(): void
    {
        $agent = User::create([
            'tenant_id' => $this->tenant->id, 'name' => 'Agent',
            'email' => 'agent@wep.test', 'password' => Hash::make('password'), 'role' => 'agent',
        ]);
        RolePermission::create([
            'tenant_id' => $this->tenant->id, 'role' => 'agent', 'module' => 'reports',
            'can_read' => false, 'can_create' => false, 'can_update' => false, 'can_delete' => false,
        ]);

        $this->actingAs($agent)->withHeaders(['X-Tenant' => 'wep'])
            ->getJson('/api/dashboard/widget-data?entity=lead')
            ->assertStatus(403);
    }
}
