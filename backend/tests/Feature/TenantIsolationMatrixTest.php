<?php

namespace Tests\Feature;

use App\Models\Automation;
use App\Models\Client;
use App\Models\Contact;
use App\Models\CustomFieldDefinition;
use App\Models\Form;
use App\Models\LandingPage;
use App\Models\Lead;
use App\Models\PipelineStage;
use App\Models\Task;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WhatsappTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Data-driven multi-tenant isolation guarantees.
 *
 * The previous TenantIsolationTest only exercised leads + contacts. This
 * sweeps every tenant-scoped resource for two distinct leak vectors:
 *   1. Listing endpoints must never surface another tenant's rows.
 *   2. Mutating a record by id must be denied (404 via global scope, or 403
 *      via an explicit controller guard) when it belongs to another tenant.
 */
class TenantIsolationMatrixTest extends TestCase
{
    use RefreshDatabase;

    private function makeTenantWithAdmin(string $subdomain): array
    {
        $tenant = Tenant::create([
            'name'      => "Tenant $subdomain",
            'subdomain' => $subdomain,
            'status'    => 'active',
        ]);

        $admin = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Admin',
            'email'     => "admin@$subdomain.test",
            'password'  => bcrypt('password'),
            'role'      => 'admin',
        ]);

        return [$tenant, $admin];
    }

    /** Create a record under a specific tenant, filling unique columns as needed. */
    private function seedRecord(int $tenantId, string $class, array $attrs, array $unique): object
    {
        $token = substr(md5(uniqid('', true)), 0, 8);

        foreach ($unique as $field) {
            $attrs[$field] = ($attrs[$field] ?? $field) . '-' . $token;
        }

        if ($class === User::class) {
            $attrs['email']    = "seed-$token@iso.test";
            $attrs['password'] = bcrypt('password');
        }

        app()->instance('current_tenant_id', $tenantId);
        $model = $class::create(array_merge(['tenant_id' => $tenantId], $attrs));
        app()->forgetInstance('current_tenant_id');

        return $model;
    }

    public static function indexResources(): array
    {
        return [
            'leads'              => [Lead::class,                  ['name' => 'Iso'],                                              '/api/leads',              'data.data',   []],
            'contacts'           => [Contact::class,               ['name' => 'Iso'],                                              '/api/contacts',           'data.data',   []],
            'clients'            => [Client::class,                ['name' => 'Iso'],                                              '/api/clients',            'data.data',   []],
            'tasks'              => [Task::class,                  ['title' => 'Iso'],                                             '/api/tasks',              'data',        []],
            'automations'        => [Automation::class,            ['name' => 'Iso', 'trigger_type' => 'lead_created', 'conditions' => [], 'actions' => []], '/api/automations', 'data', []],
            'forms'              => [Form::class,                  ['name' => 'Iso', 'slug' => 'iso', 'fields' => []],             '/api/forms',              'data',        ['slug']],
            'landing-pages'      => [LandingPage::class,           ['title' => 'Iso', 'slug' => 'iso', 'status' => 'draft', 'blocks' => []], '/api/landing-pages', 'data', ['slug']],
            'whatsapp-templates' => [WhatsappTemplate::class,      ['name' => 'Iso', 'body' => 'hello'],                           '/api/whatsapp-templates', 'data',        []],
            'pipeline'           => [PipelineStage::class,         ['name' => 'Iso', 'position' => 1],                             '/api/pipeline',           'data',        []],
            'users'              => [User::class,                  ['name' => 'Iso'],                                              '/api/users',              'data',        []],
            'custom-fields'      => [CustomFieldDefinition::class, ['name' => 'iso', 'label' => 'Iso', 'field_type' => 'text'],   '/api/custom-fields',      'data.custom', ['name']],
        ];
    }

    /**
     * @dataProvider indexResources
     */
    public function test_listing_endpoint_does_not_leak_other_tenants_rows(
        string $class,
        array $attrs,
        string $url,
        string $path,
        array $unique,
    ): void {
        [$tenantA, $adminA] = $this->makeTenantWithAdmin('iso-a-' . substr(md5($url), 0, 6));
        [$tenantB]          = $this->makeTenantWithAdmin('iso-b-' . substr(md5($url), 0, 6));

        $control = $this->seedRecord($tenantA->id, $class, $attrs, $unique);
        $foreign = $this->seedRecord($tenantB->id, $class, $attrs, $unique);

        $response = $this->actingAs($adminA)
            ->withHeaders(['X-Tenant' => $tenantA->subdomain])
            ->getJson($url);

        $response->assertOk();

        $ids = collect($response->json($path))->pluck('id')->all();

        $this->assertContains($control->id, $ids, "Tenant A's own {$class} should be listed");
        $this->assertNotContains($foreign->id, $ids, "Tenant B's {$class} leaked into tenant A's listing");
    }

    public static function deletableResources(): array
    {
        return [
            'leads'              => [Lead::class,                  ['name' => 'Iso'],                                              '/api/leads/%d',              []],
            'contacts'           => [Contact::class,               ['name' => 'Iso'],                                              '/api/contacts/%d',           []],
            'clients'            => [Client::class,                ['name' => 'Iso'],                                              '/api/clients/%d',            []],
            'tasks'              => [Task::class,                  ['title' => 'Iso'],                                             '/api/tasks/%d',              []],
            'automations'        => [Automation::class,            ['name' => 'Iso', 'trigger_type' => 'lead_created', 'conditions' => [], 'actions' => []], '/api/automations/%d', []],
            'forms'              => [Form::class,                  ['name' => 'Iso', 'slug' => 'iso', 'fields' => []],             '/api/forms/%d',              ['slug']],
            'landing-pages'      => [LandingPage::class,           ['title' => 'Iso', 'slug' => 'iso', 'status' => 'draft', 'blocks' => []], '/api/landing-pages/%d', ['slug']],
            'whatsapp-templates' => [WhatsappTemplate::class,      ['name' => 'Iso', 'body' => 'hello'],                           '/api/whatsapp-templates/%d', []],
            'pipeline'           => [PipelineStage::class,         ['name' => 'Iso', 'position' => 1],                             '/api/pipeline/%d',           []],
            'users'              => [User::class,                  ['name' => 'Iso'],                                              '/api/users/%d',              []],
            'custom-fields'      => [CustomFieldDefinition::class, ['name' => 'iso', 'label' => 'Iso', 'field_type' => 'text'],   '/api/custom-fields/%d',      ['name']],
        ];
    }

    /**
     * @dataProvider deletableResources
     */
    public function test_cannot_delete_another_tenants_record(
        string $class,
        array $attrs,
        string $urlTemplate,
        array $unique,
    ): void {
        [$tenantA, $adminA] = $this->makeTenantWithAdmin('del-a-' . substr(md5($urlTemplate), 0, 6));
        [$tenantB]          = $this->makeTenantWithAdmin('del-b-' . substr(md5($urlTemplate), 0, 6));

        $foreign = $this->seedRecord($tenantB->id, $class, $attrs, $unique);

        $response = $this->actingAs($adminA)
            ->withHeaders(['X-Tenant' => $tenantA->subdomain])
            ->deleteJson(sprintf($urlTemplate, $foreign->id));

        // Either the global scope hides the row from route-model binding (404)
        // or an explicit controller guard rejects it (403) — both are acceptable.
        $this->assertContains(
            $response->status(),
            [403, 404],
            "Deleting tenant B's {$class} as tenant A returned {$response->status()} (expected 403/404)"
        );

        // The foreign row must still exist.
        $this->assertDatabaseHas((new $class)->getTable(), ['id' => $foreign->id]);
    }
}
