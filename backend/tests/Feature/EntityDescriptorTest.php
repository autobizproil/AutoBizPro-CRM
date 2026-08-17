<?php

namespace Tests\Feature;

use App\Services\Reporting\EntityDescriptor;
use Tests\TestCase;

class EntityDescriptorTest extends TestCase
{
    public function test_all_returns_the_five_supported_entities(): void
    {
        $keys = array_keys(EntityDescriptor::all());

        sort($keys);
        $this->assertSame(['activity', 'client', 'contact', 'lead', 'task'], $keys);
    }

    public function test_for_returns_null_for_unknown_entity(): void
    {
        $this->assertNull(EntityDescriptor::for('invoice'));
    }

    public function test_lead_descriptor_exposes_expected_shape(): void
    {
        $lead = EntityDescriptor::for('lead');

        $this->assertSame(\App\Models\Lead::class, $lead['model']);
        $this->assertSame('leads', $lead['table']);
        $this->assertSame('assigned_to', $lead['ownerColumn']);

        // Group fields carry the metadata the UI needs to render smart inputs
        $this->assertSame('lookup', $lead['groupFields']['assigned_to']['type']);
        $this->assertSame('users', $lead['groupFields']['assigned_to']['lookup']);
        $this->assertSame('lookup', $lead['groupFields']['pipeline_stage_id']['type']);
        $this->assertSame('stages', $lead['groupFields']['pipeline_stage_id']['lookup']);
        $this->assertSame('enum', $lead['groupFields']['source']['type']);

        $this->assertArrayHasKey('created_at', $lead['dateFields']);
    }

    public function test_task_descriptor_exposes_status_and_priority_enums(): void
    {
        $task = EntityDescriptor::for('task');

        $this->assertSame('enum', $task['filterFields']['status']['type']);
        $this->assertArrayHasKey('open', $task['filterFields']['status']['options']);
        $this->assertArrayHasKey('done', $task['filterFields']['status']['options']);
        $this->assertArrayHasKey('due_at', $task['dateFields']);
    }

    public function test_every_descriptor_has_all_required_keys(): void
    {
        foreach (EntityDescriptor::all() as $key => $d) {
            foreach (['label', 'model', 'table', 'valueFields', 'groupFields', 'filterFields', 'dateFields'] as $required) {
                $this->assertArrayHasKey($required, $d, "entity '{$key}' is missing '{$required}'");
            }
            $this->assertArrayHasKey('ownerColumn', $d, "entity '{$key}' is missing 'ownerColumn'");
        }
    }
}
