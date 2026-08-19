<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\Client;
use App\Models\CustomFieldDefinition;
use App\Models\Lead;
use App\Models\PipelineStage;
use App\Models\Record;
use App\Models\RecordType;
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

    public function test_sum_aggregates_deal_value_grouped_by_source(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook', 'deal_value' => 1000]);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'source' => 'facebook', 'deal_value' => 500]);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'C', 'source' => 'website', 'deal_value' => 250]);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'D', 'source' => 'website']); // null deal_value

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'displayField' => 'source', 'valueField' => 'deal_value', 'aggregation' => 'sum',
        ], $this->admin);

        $bySource = collect($result['rows'])->keyBy('key');
        $this->assertSame(1500.0, $bySource['facebook']['total']);
        $this->assertSame(250.0, $bySource['website']['total']);
        $this->assertSame(1750.0, $result['total']);
    }

    public function test_avg_aggregates_deal_value(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'deal_value' => 100]);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'deal_value' => 300]);

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'valueField' => 'deal_value', 'aggregation' => 'avg',
        ], $this->admin);

        $this->assertSame(200.0, $result['rows'][0]['total']);
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

    public function test_resolved_range_is_echoed_when_time_period_set(): void
    {
        \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse('2026-08-19 12:00:00'));

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);

        $result = $this->service()->aggregate([
            'entity'     => 'lead',
            'timePeriod' => ['field' => 'created_at', 'operator' => 'current_month'],
        ], $this->admin);

        $this->assertSame('2026-08-01', $result['resolvedRange']['from']);
        $this->assertSame('2026-08-31', $result['resolvedRange']['to']);

        \Carbon\Carbon::setTestNow();
    }

    public function test_resolved_range_is_null_without_time_period(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);

        $result = $this->service()->aggregate(['entity' => 'lead'], $this->admin);

        $this->assertNull($result['resolvedRange']);
    }

    public function test_resolved_range_is_null_for_unresolvable_operator(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);

        $result = $this->service()->aggregate([
            'entity'     => 'lead',
            'timePeriod' => ['field' => 'created_at', 'operator' => 'not_a_real_operator'],
        ], $this->admin);

        $this->assertNull($result['resolvedRange']);
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

    // --- Fix 1: cf_* condition against an entity with no JSON column must not 500 ---

    public function test_custom_field_condition_on_task_entity_is_dropped_not_errored(): void
    {
        Task::create(['tenant_id' => $this->tenant->id, 'title' => 'T1', 'status' => 'open', 'priority' => 'high']);
        Task::create(['tenant_id' => $this->tenant->id, 'title' => 'T2', 'status' => 'done', 'priority' => 'low']);

        // tasks has no custom_fields column; ConditionFilter must drop the cf_* condition
        // (same as any other field not in the whitelist) rather than build SQL against
        // a nonexistent column.
        $result = $this->service()->aggregate([
            'entity'     => 'task',
            'conditions' => [['field' => 'cf_anything', 'operator' => 'equals', 'value' => '1']],
        ], $this->admin);

        // Condition is ignored entirely -> both rows still counted.
        $this->assertSame(2.0, $result['total']);
    }

    public function test_custom_field_condition_on_activity_entity_is_dropped_not_errored(): void
    {
        $lead = Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);
        Activity::create([
            'tenant_id' => $this->tenant->id, 'entity_type' => 'lead', 'entity_id' => $lead->id,
            'type' => 'note', 'body' => 'hi', 'user_id' => $this->admin->id,
        ]);

        $result = $this->service()->aggregate([
            'entity'     => 'activity',
            'conditions' => [['field' => 'cf_anything', 'operator' => 'equals', 'value' => '1']],
        ], $this->admin);

        $this->assertSame(1.0, $result['total']);
    }

    public function test_custom_field_condition_on_lead_entity_still_filters(): void
    {
        // leads DO have custom_fields, so a cf_* condition should still be honoured.
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'custom_fields' => ['budget' => '100']]);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'custom_fields' => ['budget' => '200']]);

        $result = $this->service()->aggregate([
            'entity'     => 'lead',
            'conditions' => [['field' => 'cf_budget', 'operator' => 'equals', 'value' => '100']],
        ], $this->admin);

        $this->assertSame(1.0, $result['total']);
    }

    // --- Fix 2: grouped results are capped at 50 rows ---

    public function test_grouped_results_are_capped_at_50_rows(): void
    {
        for ($i = 0; $i < 60; $i++) {
            Lead::create(['tenant_id' => $this->tenant->id, 'name' => "Lead {$i}", 'source' => "source-{$i}"]);
        }

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'displayField' => 'source',
        ], $this->admin);

        $this->assertLessThanOrEqual(50, count($result['rows']));
        $this->assertSame(50, count($result['rows']));
        $this->assertSame(60.0, $result['total']);
    }

    // --- Fix 3: whitelist rejection paths + agent scoping ---

    public function test_rejected_aggregation_value_falls_back_to_count(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B']);

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'aggregation' => 'drop_table',
        ], $this->admin);

        $this->assertSame(2.0, $result['total']);
    }

    public function test_condition_with_field_outside_whitelist_is_ignored(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B']);

        $result = $this->service()->aggregate([
            'entity'     => 'lead',
            'conditions' => [['field' => 'not_a_real_field', 'operator' => 'equals', 'value' => 'x']],
        ], $this->admin);

        // ConditionFilter::apply() drops conditions on fields outside $systemFields
        // (and not a valid cf_* field) — matches the same behavior as an unknown
        // display/date field elsewhere in this suite.
        $this->assertSame(2.0, $result['total']);
    }

    public function test_agent_scoping_on_client_entity(): void
    {
        $agent = User::create([
            'tenant_id' => $this->tenant->id, 'name' => 'Agent',
            'email' => 'agent-client@widget.test', 'password' => Hash::make('password'), 'role' => 'agent',
        ]);

        Client::create(['tenant_id' => $this->tenant->id, 'name' => 'Mine', 'assigned_to' => $agent->id]);
        Client::create(['tenant_id' => $this->tenant->id, 'name' => 'Theirs']);

        $result = $this->service()->aggregate(['entity' => 'client'], $agent);

        $this->assertSame(1.0, $result['total']);
    }

    public function test_agent_scoping_on_task_entity(): void
    {
        $agent = User::create([
            'tenant_id' => $this->tenant->id, 'name' => 'Agent',
            'email' => 'agent-task@widget.test', 'password' => Hash::make('password'), 'role' => 'agent',
        ]);

        Task::create(['tenant_id' => $this->tenant->id, 'title' => 'Mine', 'status' => 'open', 'assigned_to' => $agent->id]);
        Task::create(['tenant_id' => $this->tenant->id, 'title' => 'Theirs', 'status' => 'open']);

        $result = $this->service()->aggregate(['entity' => 'task'], $agent);

        $this->assertSame(1.0, $result['total']);
    }

    public function test_agent_scoping_on_activity_entity_scopes_through_owned_leads(): void
    {
        $agent = User::create([
            'tenant_id' => $this->tenant->id, 'name' => 'Agent',
            'email' => 'agent-activity@widget.test', 'password' => Hash::make('password'), 'role' => 'agent',
        ]);

        $myLead      = Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'Mine', 'assigned_to' => $agent->id]);
        $theirLead   = Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'Theirs']);

        Activity::create([
            'tenant_id' => $this->tenant->id, 'entity_type' => 'lead', 'entity_id' => $myLead->id,
            'type' => 'note', 'body' => 'mine', 'user_id' => $agent->id,
        ]);
        Activity::create([
            'tenant_id' => $this->tenant->id, 'entity_type' => 'lead', 'entity_id' => $theirLead->id,
            'type' => 'note', 'body' => 'theirs', 'user_id' => $this->admin->id,
        ]);

        $result = $this->service()->aggregate(['entity' => 'activity'], $agent);

        $this->assertSame(1.0, $result['total']);
    }

    public function test_or_conditions_widen_results_beyond_and_conditions(): void
    {
        // AND(status=open) AND OR(source=website): only a lead satisfying BOTH the
        // AND-group and at least one OR-group condition qualifies. 'A' satisfies both;
        // 'B' satisfies only the OR-group (fails the AND-group's status=open); 'C'
        // satisfies neither.
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'website', 'status' => 'open']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'source' => 'website', 'status' => 'won']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'C', 'source' => 'referral', 'status' => 'lost']);

        $result = $this->service()->aggregate([
            'entity'       => 'lead',
            'displayField' => 'source',
            'conditions'   => [['field' => 'status', 'operator' => 'equals', 'value' => 'open']],
            'orConditions' => [['field' => 'source', 'operator' => 'equals', 'value' => 'website']],
        ], $this->admin);

        $sources = collect($result['rows'])->pluck('key')->all();
        $this->assertSame(['website'], $sources);
    }

    public function test_empty_or_conditions_is_a_no_op(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook']);

        $result = $this->service()->aggregate([
            'entity'       => 'lead',
            'orConditions' => [],
        ], $this->admin);

        $this->assertSame(1.0, $result['total']);
    }

    public function test_group_by_second_dimension_produces_series_shape(): void
    {
        $agentA = User::create(['tenant_id' => $this->tenant->id, 'name' => 'Agent A', 'email' => 'a@widget.test', 'password' => Hash::make('x'), 'role' => 'agent']);
        $agentB = User::create(['tenant_id' => $this->tenant->id, 'name' => 'Agent B', 'email' => 'b@widget.test', 'password' => Hash::make('x'), 'role' => 'agent']);

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A1', 'source' => 'facebook', 'assigned_to' => $agentA->id]);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A2', 'source' => 'facebook', 'assigned_to' => $agentB->id]);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A3', 'source' => 'website',  'assigned_to' => $agentA->id]);

        $result = $this->service()->aggregate([
            'entity'       => 'lead',
            'displayField' => 'source',
            'groupBy'      => ['field' => 'assigned_to'],
        ], $this->admin);

        $this->assertArrayHasKey('seriesKeys', $result);
        $seriesLabels = collect($result['seriesKeys'])->pluck('label')->sort()->values()->all();
        $this->assertSame(['Agent A', 'Agent B'], $seriesLabels);

        $facebookRow = collect($result['rows'])->firstWhere('key', 'facebook');
        $this->assertNotNull($facebookRow);
        $this->assertArrayHasKey('series', $facebookRow);
        $this->assertSame(1.0, $facebookRow['series'][(string) $agentA->id]);
        $this->assertSame(1.0, $facebookRow['series'][(string) $agentB->id]);

        $this->assertSame(3.0, $result['total']);
    }

    public function test_group_by_date_field_uses_granularity(): void
    {
        \Carbon\Carbon::setTestNow(\Carbon\Carbon::parse('2026-08-19'));

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook'])
            ->forceFill(['created_at' => \Carbon\Carbon::parse('2026-08-01')])->saveQuietly();
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'source' => 'facebook'])
            ->forceFill(['created_at' => \Carbon\Carbon::parse('2026-08-15')])->saveQuietly();

        $result = $this->service()->aggregate([
            'entity'       => 'lead',
            'displayField' => 'source',
            'groupBy'      => ['field' => 'created_at', 'granularity' => 'month'],
        ], $this->admin);

        // Both leads fall in the same month bucket
        $facebookRow = collect($result['rows'])->firstWhere('key', 'facebook');
        $this->assertCount(1, $facebookRow['series']);
        $this->assertSame(2.0, array_sum($facebookRow['series']));

        \Carbon\Carbon::setTestNow();
    }

    public function test_group_by_unknown_field_is_ignored_falls_back_to_flat_shape(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook']);

        $result = $this->service()->aggregate([
            'entity'       => 'lead',
            'displayField' => 'source',
            'groupBy'      => ['field' => 'password'],
        ], $this->admin);

        $this->assertArrayNotHasKey('seriesKeys', $result);
        $this->assertSame(1.0, $result['rows'][0]['total']);
    }

    public function test_group_by_caps_at_top_50_groups_with_complete_series_each(): void
    {
        $agentA = User::create(['tenant_id' => $this->tenant->id, 'name' => 'Agent A', 'email' => 'ga@widget.test', 'password' => Hash::make('x'), 'role' => 'agent']);
        $agentB = User::create(['tenant_id' => $this->tenant->id, 'name' => 'Agent B', 'email' => 'gb@widget.test', 'password' => Hash::make('x'), 'role' => 'agent']);

        // 60 distinct source values, each with a lead for BOTH agents (2 series per
        // group) so a naive limit(200) on the group×series cross product (120 rows
        // here) would truncate some groups to a single series instead of both.
        for ($i = 0; $i < 60; $i++) {
            Lead::create(['tenant_id' => $this->tenant->id, 'name' => "A{$i}", 'source' => "source-{$i}", 'assigned_to' => $agentA->id]);
            Lead::create(['tenant_id' => $this->tenant->id, 'name' => "B{$i}", 'source' => "source-{$i}", 'assigned_to' => $agentB->id]);
        }

        $result = $this->service()->aggregate([
            'entity'       => 'lead',
            'displayField' => 'source',
            'groupBy'      => ['field' => 'assigned_to'],
        ], $this->admin);

        $this->assertLessThanOrEqual(50, count($result['rows']));

        // Every group that made the cut must have BOTH series represented — no
        // group is allowed to appear with a partial series set.
        foreach ($result['rows'] as $row) {
            $this->assertCount(2, $row['series'], "group '{$row['key']}' is missing a series");
            $this->assertSame(1.0, $row['series'][(string) $agentA->id]);
            $this->assertSame(1.0, $row['series'][(string) $agentB->id]);
        }
    }

    public function test_group_by_without_display_field_is_ignored(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);

        $result = $this->service()->aggregate([
            'entity'  => 'lead',
            'groupBy' => ['field' => 'source'],
        ], $this->admin);

        // No displayField at all → ungrouped branch, groupBy never even consulted.
        $this->assertArrayNotHasKey('seriesKeys', $result);
        $this->assertSame(1.0, $result['rows'][0]['total']);
    }

    // ── Custom record types (entity: "record:<slug>") ───────────────────────────

    private function makeInvoiceType(): RecordType
    {
        $rt = RecordType::create([
            'tenant_id' => $this->tenant->id, 'slug' => 'invoices', 'label' => 'חשבוניות',
        ]);
        CustomFieldDefinition::create([
            'tenant_id' => $this->tenant->id, 'entity' => 'invoices', 'name' => 'amount',
            'label' => 'סכום', 'field_type' => 'number', 'sort_order' => 1,
        ]);
        CustomFieldDefinition::create([
            'tenant_id' => $this->tenant->id, 'entity' => 'invoices', 'name' => 'status',
            'label' => 'סטטוס', 'field_type' => 'select', 'options' => ['open', 'paid'], 'sort_order' => 2,
        ]);

        return $rt;
    }

    public function test_unknown_record_type_slug_throws(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        $this->service()->aggregate(['entity' => 'record:nonexistent'], $this->admin);
    }

    public function test_record_type_sum_grouped_by_json_field(): void
    {
        $rt = $this->makeInvoiceType();
        Record::create(['tenant_id' => $this->tenant->id, 'record_type_id' => $rt->id, 'data' => ['amount' => 100, 'status' => 'open']]);
        Record::create(['tenant_id' => $this->tenant->id, 'record_type_id' => $rt->id, 'data' => ['amount' => 250, 'status' => 'open']]);
        Record::create(['tenant_id' => $this->tenant->id, 'record_type_id' => $rt->id, 'data' => ['amount' => 50, 'status' => 'paid']]);

        $result = $this->service()->aggregate([
            'entity' => 'record:invoices', 'displayField' => 'status',
            'valueField' => 'amount', 'aggregation' => 'sum',
        ], $this->admin);

        $byStatus = collect($result['rows'])->keyBy('key');
        $this->assertSame(350.0, $byStatus['open']['total']);
        $this->assertSame(50.0, $byStatus['paid']['total']);
        $this->assertSame(400.0, $result['total']);
    }

    public function test_record_type_only_counts_its_own_records(): void
    {
        $invoices = $this->makeInvoiceType();
        $quotes   = RecordType::create(['tenant_id' => $this->tenant->id, 'slug' => 'quotes', 'label' => 'הצעות מחיר']);

        Record::create(['tenant_id' => $this->tenant->id, 'record_type_id' => $invoices->id, 'data' => ['amount' => 100]]);
        Record::create(['tenant_id' => $this->tenant->id, 'record_type_id' => $quotes->id, 'data' => ['amount' => 999]]);

        $result = $this->service()->aggregate(['entity' => 'record:invoices'], $this->admin);

        $this->assertSame(1.0, $result['total']);
    }

    public function test_record_type_condition_filters_on_json_field(): void
    {
        $rt = $this->makeInvoiceType();
        Record::create(['tenant_id' => $this->tenant->id, 'record_type_id' => $rt->id, 'data' => ['amount' => 100, 'status' => 'open']]);
        Record::create(['tenant_id' => $this->tenant->id, 'record_type_id' => $rt->id, 'data' => ['amount' => 200, 'status' => 'paid']]);

        $result = $this->service()->aggregate([
            'entity' => 'record:invoices',
            'conditions' => [['field' => 'status', 'operator' => 'equals', 'value' => 'paid']],
        ], $this->admin);

        $this->assertSame(1.0, $result['total']);
    }

    public function test_record_type_from_a_different_tenant_is_not_visible(): void
    {
        $otherTenant = Tenant::create(['name' => 'Other', 'subdomain' => 'other-widget', 'status' => 'active']);
        RecordType::create(['tenant_id' => $otherTenant->id, 'slug' => 'invoices', 'label' => 'Other Invoices']);

        $this->expectException(\InvalidArgumentException::class);

        $this->service()->aggregate(['entity' => 'record:invoices'], $this->admin);
    }
}
