<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\PipelineStage;
use App\Models\Task;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Reporting\WidgetDataService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WidgetDataServiceTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'name' => 'Widget Tenant', 'subdomain' => 'widget', 'status' => 'active',
        ]);
        app()->instance('current_tenant_id', $this->tenant->id);

        $this->admin = User::create([
            'tenant_id' => $this->tenant->id, 'name' => 'Admin',
            'email' => 'admin@widget.test', 'password' => Hash::make('password'), 'role' => 'admin',
        ]);
    }

    private function service(): WidgetDataService
    {
        return app(WidgetDataService::class);
    }

    public function test_unknown_entity_throws(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        $this->service()->aggregate(['entity' => 'invoice'], $this->admin);
    }

    public function test_counts_records_grouped_by_enum_field(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'source' => 'facebook']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'C', 'source' => 'website']);

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'aggregation' => 'count', 'displayField' => 'source',
        ], $this->admin);

        $this->assertSame(3.0, $result['total']);

        $bySource = collect($result['rows'])->keyBy('key');
        $this->assertSame(2.0, $bySource['facebook']['total']);
        $this->assertSame(1.0, $bySource['website']['total']);
        // Enum keys resolve to their Hebrew label
        $this->assertSame('פייסבוק', $bySource['facebook']['label']);
    }

    public function test_ungrouped_count_returns_single_row(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B']);

        $result = $this->service()->aggregate(['entity' => 'lead'], $this->admin);

        $this->assertCount(1, $result['rows']);
        $this->assertSame(2.0, $result['rows'][0]['total']);
        $this->assertSame(2.0, $result['total']);
    }

    public function test_lookup_group_field_resolves_user_names(): void
    {
        $agent = User::create([
            'tenant_id' => $this->tenant->id, 'name' => 'דנה נציגה',
            'email' => 'dana@widget.test', 'password' => Hash::make('password'), 'role' => 'agent',
        ]);

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'assigned_to' => $agent->id]);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B']);

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'displayField' => 'assigned_to',
        ], $this->admin);

        $labels = collect($result['rows'])->pluck('label')->all();
        $this->assertContains('דנה נציגה', $labels);
        $this->assertContains('לא משויך', $labels);
    }

    public function test_lookup_group_field_resolves_stage_names_and_colors(): void
    {
        $stage = PipelineStage::create([
            'tenant_id' => $this->tenant->id, 'name' => 'ליד חדש',
            'color' => '#6366f1', 'position' => 1, 'type' => 'lead',
        ]);

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'pipeline_stage_id' => $stage->id]);

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'displayField' => 'pipeline_stage_id',
        ], $this->admin);

        $this->assertSame('ליד חדש', $result['rows'][0]['label']);
        $this->assertSame('#6366f1', $result['rows'][0]['color']);
    }

    public function test_time_period_filters_rows(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-19 12:00:00'));

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'Recent', 'source' => 'recent']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'Old', 'source' => 'old'])
            ->forceFill(['created_at' => Carbon::parse('2026-01-01')])->saveQuietly();

        $result = $this->service()->aggregate([
            'entity'     => 'lead',
            'displayField' => 'source',
            'timePeriod' => ['field' => 'created_at', 'operator' => 'current_month'],
        ], $this->admin);

        $sources = collect($result['rows'])->pluck('key')->all();
        $this->assertContains('recent', $sources);
        $this->assertNotContains('old', $sources);

        Carbon::setTestNow();
    }

    public function test_time_period_with_unknown_date_field_is_ignored(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);

        $result = $this->service()->aggregate([
            'entity'     => 'lead',
            'timePeriod' => ['field' => 'evil_column', 'operator' => 'current_month'],
        ], $this->admin);

        $this->assertSame(1.0, $result['total']);
    }

    public function test_conditions_filter_rows(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'דני כהן', 'source' => 'match']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'רוני לוי', 'source' => 'nomatch']);

        $result = $this->service()->aggregate([
            'entity'       => 'lead',
            'displayField' => 'source',
            'conditions'   => [['field' => 'name', 'operator' => 'contains', 'value' => 'כהן']],
        ], $this->admin);

        $sources = collect($result['rows'])->pluck('key')->all();
        $this->assertSame(['match'], $sources);
    }

    public function test_unknown_display_field_falls_back_to_ungrouped(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'displayField' => 'password',
        ], $this->admin);

        $this->assertCount(1, $result['rows']);
        $this->assertSame(1.0, $result['rows'][0]['total']);
    }

    public function test_agent_only_sees_their_own_rows(): void
    {
        $agent = User::create([
            'tenant_id' => $this->tenant->id, 'name' => 'Agent',
            'email' => 'agent@widget.test', 'password' => Hash::make('password'), 'role' => 'agent',
        ]);

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'Mine', 'source' => 'mine', 'assigned_to' => $agent->id]);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'Theirs', 'source' => 'theirs']);

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'displayField' => 'source',
        ], $agent);

        $sources = collect($result['rows'])->pluck('key')->all();
        $this->assertSame(['mine'], $sources);
    }

    public function test_task_entity_groups_by_status(): void
    {
        Task::create(['tenant_id' => $this->tenant->id, 'title' => 'T1', 'status' => 'open', 'priority' => 'high']);
        Task::create(['tenant_id' => $this->tenant->id, 'title' => 'T2', 'status' => 'done', 'priority' => 'low']);
        Task::create(['tenant_id' => $this->tenant->id, 'title' => 'T3', 'status' => 'open', 'priority' => 'low']);

        $result = $this->service()->aggregate([
            'entity' => 'task', 'displayField' => 'status',
        ], $this->admin);

        $byStatus = collect($result['rows'])->keyBy('key');
        $this->assertSame(2.0, $byStatus['open']['total']);
        $this->assertSame('פתוחה', $byStatus['open']['label']);
    }
}
