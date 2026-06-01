<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\Lead;
use App\Models\PipelineStage;
use App\Models\RolePermission;
use App\Models\Tenant;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReportsTest extends TestCase
{
    use RefreshDatabase;

    // ── Helpers ────────────────────────────────────────────────────────────────

    private function setupTenant(string $sub = 'rep'): array
    {
        $tenant = Tenant::create([
            'name'      => 'Reports Tenant',
            'subdomain' => $sub,
            'status'    => 'active',
        ]);
        app()->instance('current_tenant_id', $tenant->id);

        $admin = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Admin',
            'email'     => "admin@{$sub}.test",
            'password'  => Hash::make('password'),
            'role'      => 'admin',
        ]);

        return [$tenant, $admin];
    }

    private function setupAgent(Tenant $tenant, string $sub): User
    {
        $agent = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Agent',
            'email'     => "agent@{$sub}.test",
            'password'  => Hash::make('password'),
            'role'      => 'agent',
        ]);

        // Agents don't have reports permission by default — grant it for tests
        RolePermission::create([
            'tenant_id'  => $tenant->id,
            'role'       => 'agent',
            'module'     => 'reports',
            'can_read'   => true,
            'can_create' => false,
            'can_update' => false,
            'can_delete' => false,
        ]);

        return $agent;
    }

    // ── reportLeadsBySource ────────────────────────────────────────────────────

    public function test_leads_by_source_returns_correct_structure(): void
    {
        [$tenant, $admin] = $this->setupTenant('src1');

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'L1', 'source' => 'facebook']);
        Lead::create(['tenant_id' => $tenant->id, 'name' => 'L2', 'source' => 'facebook']);
        Lead::create(['tenant_id' => $tenant->id, 'name' => 'L3', 'source' => 'website']);

        $resp = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'src1'])
            ->getJson('/api/dashboard/reports/leads-by-source?period=month');

        $resp->assertOk();
        $resp->assertJsonStructure([
            'success',
            'data' => [
                '*' => ['source', 'total', 'percent'],
            ],
        ]);

        $data = collect($resp->json('data'));
        $fb   = $data->firstWhere('source', 'facebook');
        $this->assertNotNull($fb);
        $this->assertSame(2, $fb['total']);
        // percent: 2/3 * 100 = 66.67
        $this->assertEqualsWithDelta(66.67, $fb['percent'], 0.01);
    }

    public function test_leads_by_source_period_filter_excludes_old_leads(): void
    {
        [$tenant, $admin] = $this->setupTenant('src2');

        // Lead created 2 months ago — should NOT appear in 'month' filter
        Lead::create(['tenant_id' => $tenant->id, 'name' => 'Old', 'source' => 'old'])
            ->forceFill(['created_at' => now()->subMonths(2)])
            ->saveQuietly();

        // Lead created this month
        Lead::create(['tenant_id' => $tenant->id, 'name' => 'New', 'source' => 'new']);

        $resp = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'src2'])
            ->getJson('/api/dashboard/reports/leads-by-source?period=month');

        $resp->assertOk();
        $data    = collect($resp->json('data'));
        $sources = $data->pluck('source')->all();

        $this->assertContains('new', $sources);
        $this->assertNotContains('old', $sources);
    }

    public function test_leads_by_source_date_range_filter(): void
    {
        [$tenant, $admin] = $this->setupTenant('src3');

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'Jan', 'source' => 'jan'])
            ->forceFill(['created_at' => Carbon::parse('2026-01-15')])->saveQuietly();

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'Mar', 'source' => 'mar'])
            ->forceFill(['created_at' => Carbon::parse('2026-03-15')])->saveQuietly();

        $resp = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'src3'])
            ->getJson('/api/dashboard/reports/leads-by-source?date_from=2026-01-01&date_to=2026-01-31');

        $resp->assertOk();
        $data    = collect($resp->json('data'));
        $sources = $data->pluck('source')->all();

        $this->assertContains('jan', $sources);
        $this->assertNotContains('mar', $sources);
    }

    public function test_leads_by_source_agent_scope(): void
    {
        [$tenant, $admin] = $this->setupTenant('src4');
        $agent            = $this->setupAgent($tenant, 'src4');

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'Mine', 'source' => 'mine', 'assigned_to' => $agent->id]);
        Lead::create(['tenant_id' => $tenant->id, 'name' => 'Other', 'source' => 'other', 'assigned_to' => $admin->id]);

        $resp = $this->actingAs($agent)
            ->withHeaders(['X-Tenant' => 'src4'])
            ->getJson('/api/dashboard/reports/leads-by-source?period=month');

        $resp->assertOk();
        $data    = collect($resp->json('data'));
        $sources = $data->pluck('source')->all();

        $this->assertContains('mine', $sources);
        $this->assertNotContains('other', $sources);
    }

    // ── reportLeadsByAgent ─────────────────────────────────────────────────────

    public function test_leads_by_agent_returns_correct_structure(): void
    {
        [$tenant, $admin] = $this->setupTenant('agt1');

        $stage = PipelineStage::create([
            'tenant_id' => $tenant->id,
            'name'      => 'סגור',
            'color'     => '#f00',
            'position'  => 1,
        ]);

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'L1', 'assigned_to' => $admin->id]);
        Lead::create(['tenant_id' => $tenant->id, 'name' => 'L2', 'assigned_to' => $admin->id, 'pipeline_stage_id' => $stage->id]);

        $resp = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'agt1'])
            ->getJson('/api/dashboard/reports/leads-by-agent?period=month');

        $resp->assertOk();
        $resp->assertJsonStructure([
            'success',
            'data' => [
                '*' => ['user_id', 'name', 'total', 'open', 'closed'],
            ],
        ]);

        $data = collect($resp->json('data'));
        $row  = $data->firstWhere('user_id', $admin->id);
        $this->assertNotNull($row);
        $this->assertSame(2, $row['total']);
        $this->assertSame(1, $row['closed']); // one in 'סגור' stage
        $this->assertSame(1, $row['open']);
    }

    public function test_leads_by_agent_period_filter_excludes_old_leads(): void
    {
        [$tenant, $admin] = $this->setupTenant('agt2');

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'Old', 'assigned_to' => $admin->id])
            ->forceFill(['created_at' => now()->subMonths(2)])->saveQuietly();

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'New', 'assigned_to' => $admin->id]);

        $resp = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'agt2'])
            ->getJson('/api/dashboard/reports/leads-by-agent?period=month');

        $resp->assertOk();
        $data = collect($resp->json('data'));
        $row  = $data->firstWhere('user_id', $admin->id);
        // Only the current-month lead should count
        $this->assertNotNull($row);
        $this->assertSame(1, $row['total']);
    }

    public function test_leads_by_agent_agent_only_sees_themselves(): void
    {
        [$tenant, $admin] = $this->setupTenant('agt3');
        $agent            = $this->setupAgent($tenant, 'agt3');

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'Mine', 'assigned_to' => $agent->id]);
        Lead::create(['tenant_id' => $tenant->id, 'name' => 'Other', 'assigned_to' => $admin->id]);

        $resp = $this->actingAs($agent)
            ->withHeaders(['X-Tenant' => 'agt3'])
            ->getJson('/api/dashboard/reports/leads-by-agent?period=month');

        $resp->assertOk();
        $data    = collect($resp->json('data'));
        $userIds = $data->pluck('user_id')->all();

        $this->assertContains($agent->id, $userIds);
        $this->assertNotContains($admin->id, $userIds);
    }

    // ── reportActivities ──────────────────────────────────────────────────────

    public function test_activities_returns_correct_structure(): void
    {
        [$tenant, $admin] = $this->setupTenant('act1');

        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'L1']);

        Activity::create(['tenant_id' => $tenant->id, 'entity_type' => 'lead', 'entity_id' => $lead->id, 'type' => 'call', 'user_id' => $admin->id]);
        Activity::create(['tenant_id' => $tenant->id, 'entity_type' => 'lead', 'entity_id' => $lead->id, 'type' => 'call', 'user_id' => $admin->id]);
        Activity::create(['tenant_id' => $tenant->id, 'entity_type' => 'lead', 'entity_id' => $lead->id, 'type' => 'note', 'user_id' => $admin->id]);

        $resp = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'act1'])
            ->getJson('/api/dashboard/reports/activities?period=month');

        $resp->assertOk();
        $resp->assertJsonStructure([
            'success',
            'data' => [
                '*' => ['type', 'total'],
            ],
        ]);

        $data = collect($resp->json('data'));
        $call = $data->firstWhere('type', 'call');
        $this->assertNotNull($call);
        $this->assertSame(2, $call['total']);
    }

    public function test_activities_period_filter(): void
    {
        [$tenant, $admin] = $this->setupTenant('act2');

        $lead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'L1']);

        // Create a 'meeting' activity 2 months ago — should be filtered out
        $old = Activity::create(['tenant_id' => $tenant->id, 'entity_type' => 'lead', 'entity_id' => $lead->id, 'type' => 'meeting', 'user_id' => $admin->id]);
        $old->forceFill(['created_at' => now()->subMonths(2)])->saveQuietly();

        // Create a 'call' activity now — should appear
        Activity::create(['tenant_id' => $tenant->id, 'entity_type' => 'lead', 'entity_id' => $lead->id, 'type' => 'call', 'user_id' => $admin->id]);

        $resp = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'act2'])
            ->getJson('/api/dashboard/reports/activities?period=month');

        $resp->assertOk();
        $data  = collect($resp->json('data'));
        $types = $data->pluck('type')->all();

        // 'call' is within the month — must appear
        $this->assertContains('call', $types);
        // 'meeting' is 2 months old — must not appear
        $this->assertNotContains('meeting', $types);
    }

    public function test_activities_agent_scope(): void
    {
        [$tenant, $admin] = $this->setupTenant('act3');
        $agent            = $this->setupAgent($tenant, 'act3');

        $myLead    = Lead::create(['tenant_id' => $tenant->id, 'name' => 'Mine', 'assigned_to' => $agent->id]);
        $otherLead = Lead::create(['tenant_id' => $tenant->id, 'name' => 'Other', 'assigned_to' => $admin->id]);

        // Agent's lead: 2 call activities
        Activity::create(['tenant_id' => $tenant->id, 'entity_type' => 'lead', 'entity_id' => $myLead->id, 'type' => 'call', 'user_id' => $agent->id]);
        Activity::create(['tenant_id' => $tenant->id, 'entity_type' => 'lead', 'entity_id' => $myLead->id, 'type' => 'call', 'user_id' => $agent->id]);

        // Admin's lead: 5 note activities — agent should NOT see these
        Activity::create(['tenant_id' => $tenant->id, 'entity_type' => 'lead', 'entity_id' => $otherLead->id, 'type' => 'note', 'user_id' => $admin->id]);
        Activity::create(['tenant_id' => $tenant->id, 'entity_type' => 'lead', 'entity_id' => $otherLead->id, 'type' => 'note', 'user_id' => $admin->id]);
        Activity::create(['tenant_id' => $tenant->id, 'entity_type' => 'lead', 'entity_id' => $otherLead->id, 'type' => 'note', 'user_id' => $admin->id]);
        Activity::create(['tenant_id' => $tenant->id, 'entity_type' => 'lead', 'entity_id' => $otherLead->id, 'type' => 'note', 'user_id' => $admin->id]);
        Activity::create(['tenant_id' => $tenant->id, 'entity_type' => 'lead', 'entity_id' => $otherLead->id, 'type' => 'note', 'user_id' => $admin->id]);

        $resp = $this->actingAs($agent)
            ->withHeaders(['X-Tenant' => 'act3'])
            ->getJson('/api/dashboard/reports/activities?period=month');

        $resp->assertOk();
        $data = collect($resp->json('data'));

        // Agent sees only their 2 'call' activities
        $callRow = $data->firstWhere('type', 'call');
        $this->assertNotNull($callRow);
        $this->assertSame(2, $callRow['total']);

        // 'note' activities on admin's lead must not bleed through
        $noteRow = $data->firstWhere('type', 'note');
        $this->assertNull($noteRow);
    }

    // ── reportConversion ──────────────────────────────────────────────────────

    public function test_conversion_returns_correct_structure(): void
    {
        [$tenant, $admin] = $this->setupTenant('conv1');

        $s1 = PipelineStage::create(['tenant_id' => $tenant->id, 'name' => 'חדש', 'color' => '#0f0', 'position' => 1]);
        $s2 = PipelineStage::create(['tenant_id' => $tenant->id, 'name' => 'סגור', 'color' => '#f00', 'position' => 2]);

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'L1', 'pipeline_stage_id' => $s1->id]);
        Lead::create(['tenant_id' => $tenant->id, 'name' => 'L2', 'pipeline_stage_id' => $s1->id]);
        Lead::create(['tenant_id' => $tenant->id, 'name' => 'L3', 'pipeline_stage_id' => $s2->id]);

        $resp = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'conv1'])
            ->getJson('/api/dashboard/reports/conversion?period=month');

        $resp->assertOk();
        $resp->assertJsonStructure([
            'success',
            'data' => [
                'funnel' => [
                    '*' => ['stage_id', 'name', 'color', 'total', 'rate'],
                ],
                'total_entered',
            ],
        ]);

        $data = $resp->json('data');
        $this->assertSame(3, $data['total_entered']);

        $funnel = collect($data['funnel']);
        $s1row  = $funnel->firstWhere('stage_id', $s1->id);
        $this->assertNotNull($s1row);
        $this->assertSame(2, $s1row['total']);
        $this->assertEqualsWithDelta(66.67, $s1row['rate'], 0.01);
    }

    public function test_conversion_period_filter(): void
    {
        [$tenant, $admin] = $this->setupTenant('conv2');

        $stage = PipelineStage::create(['tenant_id' => $tenant->id, 'name' => 'חדש', 'color' => '#0f0', 'position' => 1]);

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'Old', 'pipeline_stage_id' => $stage->id])
            ->forceFill(['created_at' => now()->subMonths(2)])->saveQuietly();

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'New', 'pipeline_stage_id' => $stage->id]);

        $resp = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'conv2'])
            ->getJson('/api/dashboard/reports/conversion?period=month');

        $resp->assertOk();
        $this->assertSame(1, $resp->json('data.total_entered'));
    }

    // ── exportLeads ───────────────────────────────────────────────────────────

    public function test_export_returns_csv_with_bom_and_correct_headers(): void
    {
        [$tenant, $admin] = $this->setupTenant('exp1');

        $stage = PipelineStage::create(['tenant_id' => $tenant->id, 'name' => 'חדש', 'color' => '#0f0', 'position' => 1]);
        Lead::create([
            'tenant_id'         => $tenant->id,
            'name'              => 'Test Lead',
            'phone'             => '0501234567',
            'email'             => 'lead@test.com',
            'source'            => 'web',
            'pipeline_stage_id' => $stage->id,
            'assigned_to'       => $admin->id,
        ]);

        $resp = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'exp1'])
            ->get('/api/dashboard/reports/export?period=month');

        $resp->assertOk();
        $resp->assertHeader('Content-Type', 'text/csv; charset=UTF-8');

        $content = $resp->streamedContent();

        // UTF-8 BOM present
        $this->assertStringStartsWith("\xEF\xBB\xBF", $content);

        // Header row present
        $this->assertStringContainsString('id,name,phone,email,source,stage,assigned_to,created_at', $content);

        // Lead data row present
        $this->assertStringContainsString('Test Lead', $content);
        $this->assertStringContainsString('חדש', $content);
    }

    public function test_export_period_filter_excludes_old_leads(): void
    {
        [$tenant, $admin] = $this->setupTenant('exp2');

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'Old Lead'])
            ->forceFill(['created_at' => now()->subMonths(2)])->saveQuietly();

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'New Lead']);

        $resp = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'exp2'])
            ->get('/api/dashboard/reports/export?period=month');

        $resp->assertOk();
        $content = $resp->streamedContent();

        $this->assertStringContainsString('New Lead', $content);
        $this->assertStringNotContainsString('Old Lead', $content);
    }

    public function test_export_agent_scope(): void
    {
        [$tenant, $admin] = $this->setupTenant('exp3');
        $agent            = $this->setupAgent($tenant, 'exp3');

        Lead::create(['tenant_id' => $tenant->id, 'name' => 'My Lead', 'assigned_to' => $agent->id]);
        Lead::create(['tenant_id' => $tenant->id, 'name' => 'Admin Lead', 'assigned_to' => $admin->id]);

        $resp = $this->actingAs($agent)
            ->withHeaders(['X-Tenant' => 'exp3'])
            ->get('/api/dashboard/reports/export?period=month');

        $resp->assertOk();
        $content = $resp->streamedContent();

        $this->assertStringContainsString('My Lead', $content);
        $this->assertStringNotContainsString('Admin Lead', $content);
    }

    // ── Auth / permission guard ────────────────────────────────────────────────

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->getJson('/api/dashboard/reports/leads-by-source')->assertStatus(401);
    }
}
