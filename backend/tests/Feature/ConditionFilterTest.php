<?php
namespace Tests\Feature;

use App\Models\Lead;
use App\Models\Tenant;
use App\Services\ConditionFilter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConditionFilterTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenant(string $sub): int
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        return $tenant->id;
    }

    public function test_equals_on_system_field(): void
    {
        $this->setupTenant('cf-eq');
        Lead::create(['name' => 'Alice', 'source' => 'web']);
        Lead::create(['name' => 'Bob', 'source' => 'phone']);

        $query = Lead::query();
        ConditionFilter::apply($query, [['field' => 'source', 'operator' => 'equals', 'value' => 'web']], ['name', 'source'], 'custom_fields');

        $results = $query->get();
        $this->assertCount(1, $results);
        $this->assertSame('Alice', $results->first()->name);
    }

    public function test_contains_on_json_custom_field_with_cf_prefix(): void
    {
        $this->setupTenant('cf-json');
        Lead::create(['name' => 'A', 'custom_fields' => ['budget_tier' => 'gold']]);
        Lead::create(['name' => 'B', 'custom_fields' => ['budget_tier' => 'silver']]);

        $query = Lead::query();
        ConditionFilter::apply($query, [['field' => 'cf_budget_tier', 'operator' => 'contains', 'value' => 'gol']], ['name'], 'custom_fields');

        $results = $query->get();
        $this->assertCount(1, $results);
        $this->assertSame('A', $results->first()->name);
    }

    public function test_field_not_in_whitelist_and_not_cf_prefixed_is_ignored(): void
    {
        $this->setupTenant('cf-wl');
        Lead::create(['name' => 'A', 'phone' => '111']);
        Lead::create(['name' => 'B', 'phone' => '222']);

        $query = Lead::query();
        // 'phone' is not in the whitelist passed here, so this condition must be a no-op
        ConditionFilter::apply($query, [['field' => 'phone', 'operator' => 'equals', 'value' => '111']], ['name'], 'custom_fields');

        $this->assertCount(2, $query->get());
    }

    public function test_all_fields_are_json_mode_targets_data_column_directly(): void
    {
        $tenantId = $this->setupTenant('cf-afaj');
        $type = \App\Models\RecordType::create(['tenant_id' => $tenantId, 'slug' => 'invoices', 'label' => 'Invoices', 'position' => 0]);
        \App\Models\Record::create(['tenant_id' => $tenantId, 'record_type_id' => $type->id, 'data' => ['title' => 'A', 'amount' => '100']]);
        \App\Models\Record::create(['tenant_id' => $tenantId, 'record_type_id' => $type->id, 'data' => ['title' => 'B', 'amount' => '200']]);

        $query = \App\Models\Record::where('record_type_id', $type->id);
        ConditionFilter::apply($query, [['field' => 'amount', 'operator' => 'equals', 'value' => '100']], [], 'data', true);

        $results = $query->get();
        $this->assertCount(1, $results);
        $this->assertSame('A', $results->first()->data['title']);
    }

    public function test_all_fields_are_json_mode_rejects_unsafe_field_name(): void
    {
        $tenantId = $this->setupTenant('cf-inj');
        $type = \App\Models\RecordType::create(['tenant_id' => $tenantId, 'slug' => 'invoices', 'label' => 'Invoices', 'position' => 0]);
        \App\Models\Record::create(['tenant_id' => $tenantId, 'record_type_id' => $type->id, 'data' => ['title' => 'A']]);

        $query = \App\Models\Record::where('record_type_id', $type->id);
        // Field name containing something that isn't [a-z0-9_] must be ignored, not interpolated into raw SQL
        ConditionFilter::apply($query, [['field' => "title') OR ('1'='1", 'operator' => 'equals', 'value' => 'A']], [], 'data', true);

        // The unsafe condition must be dropped entirely — count stays at the full unfiltered set (1)
        $this->assertCount(1, $query->get());
    }

    public function test_empty_operator(): void
    {
        $this->setupTenant('cf-empty');
        Lead::create(['name' => 'A', 'source' => '']);
        Lead::create(['name' => 'B', 'source' => 'web']);

        $query = Lead::query();
        ConditionFilter::apply($query, [['field' => 'source', 'operator' => 'empty']], ['name', 'source'], 'custom_fields');

        $results = $query->get();
        $this->assertCount(1, $results);
        $this->assertSame('A', $results->first()->name);
    }

    public function test_or_boolean_wraps_conditions_in_a_single_orwhere_group(): void
    {
        // Two leads: one matches condition A only, one matches condition B only.
        // Applying [A, B] with boolean='or' inside one where-closure must match both.
        $tenant = \App\Models\Tenant::create(['name' => 'CF', 'subdomain' => 'cf-or', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        \App\Models\Lead::create(['tenant_id' => $tenant->id, 'name' => 'Matches A', 'source' => 'facebook']);
        \App\Models\Lead::create(['tenant_id' => $tenant->id, 'name' => 'Matches B', 'source' => 'website']);
        \App\Models\Lead::create(['tenant_id' => $tenant->id, 'name' => 'Matches Neither', 'source' => 'referral']);

        $query = \App\Models\Lead::query();
        \App\Services\ConditionFilter::apply(
            $query,
            [['field' => 'source', 'operator' => 'equals', 'value' => 'facebook'],
             ['field' => 'source', 'operator' => 'equals', 'value' => 'website']],
            ['source'],
            null,
            false,
            'or'
        );

        $names = $query->pluck('name')->sort()->values()->all();
        $this->assertSame(['Matches A', 'Matches B'], $names);
    }

    public function test_default_boolean_is_and_unchanged_from_before(): void
    {
        $tenant = \App\Models\Tenant::create(['name' => 'CF2', 'subdomain' => 'cf-and', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        \App\Models\Lead::create(['tenant_id' => $tenant->id, 'name' => 'Both', 'source' => 'facebook', 'status' => 'open']);
        \App\Models\Lead::create(['tenant_id' => $tenant->id, 'name' => 'Source only', 'source' => 'facebook', 'status' => 'won']);

        $query = \App\Models\Lead::query();
        \App\Services\ConditionFilter::apply(
            $query,
            [['field' => 'source', 'operator' => 'equals', 'value' => 'facebook'],
             ['field' => 'status', 'operator' => 'equals', 'value' => 'open']],
            ['source', 'status']
        );

        $names = $query->pluck('name')->all();
        $this->assertSame(['Both'], $names);
    }
}
