<?php
namespace Tests\Feature;
use App\Models\Tenant;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_get_returns_default_label_when_unset(): void
    {
        $tenant = Tenant::create(['name'=>'T','subdomain'=>'t1','status'=>'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $svc = app(SettingsService::class);
        $this->assertSame('ליד', $svc->label('lead'));
    }

    public function test_set_and_get_custom_label(): void
    {
        $tenant = Tenant::create(['name'=>'T','subdomain'=>'t2','status'=>'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $svc = app(SettingsService::class);
        $svc->set('labels', ['lead' => 'פנייה']);
        $this->assertSame('פנייה', $svc->label('lead'));
    }
}
