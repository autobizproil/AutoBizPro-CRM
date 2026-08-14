<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\TenantSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class OnboardFacebookBridgeCommandTest extends TestCase
{
    use RefreshDatabase;

    private function configureMake(): void
    {
        config([
            'services.make.api_token'    => 'test-token-abc',
            'services.make.team_id'      => 1047106,
            'services.make.api_base_url' => 'https://eu1.make.com/api/v2',
            'app.url'                    => 'https://autobiz-crm.duckdns.org',
        ]);
    }

    public function test_unknown_tenant_aborts_with_error(): void
    {
        $this->configureMake();

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'does-not-exist'])
            ->assertExitCode(1)
            ->expectsOutputToContain('not found');
    }

    public function test_missing_make_config_aborts_before_any_api_call(): void
    {
        config(['services.make.api_token' => null, 'services.make.team_id' => null]);
        Tenant::create(['name' => 'Sonia', 'subdomain' => 'sonia-crm', 'status' => 'active']);

        Http::fake(); // if the command makes any HTTP call despite missing config, this test catches it

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'sonia-crm'])
            ->assertExitCode(1)
            ->expectsOutputToContain('MAKE_API_TOKEN');

        Http::assertNothingSent();
    }

    public function test_generates_new_secret_and_creates_scenario(): void
    {
        $this->configureMake();
        $tenant = Tenant::create(['name' => 'Sonia', 'subdomain' => 'sonia-crm', 'status' => 'active']);

        Http::fake([
            'eu1.make.com/api/v2/scenarios*' => Http::response([
                'scenario' => ['id' => 555, 'name' => 'Sonia - Facebook Lead Ads Bridge'],
            ], 200),
        ]);

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'sonia-crm'])
            ->assertExitCode(0)
            ->expectsOutputToContain('https://eu1.make.com/1047106/scenarios/555')
            ->assertSuccessful();

        $secret = TenantSetting::where('tenant_id', $tenant->id)
            ->where('key', 'make_lead_webhook_secret')->first();
        $this->assertNotNull($secret);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $secret->value);

        Http::assertSent(function ($request) use ($secret) {
            $blueprint = json_decode($request['blueprint'], true);
            $httpModule = $blueprint['flow'][1];
            return $httpModule['module'] === 'http:ActionSendData'
                && $httpModule['mapper']['url'] === 'https://autobiz-crm.duckdns.org/api/integrations/make/lead/sonia-crm'
                && $httpModule['mapper']['headers'][0]['value'] === $secret->value
                && str_contains($httpModule['mapper']['data'], '{{1.data.full_name}}');
        });
    }

    public function test_reuses_existing_secret_by_default(): void
    {
        $this->configureMake();
        $tenant = Tenant::create(['name' => 'Sonia', 'subdomain' => 'sonia-crm', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        TenantSetting::create([
            'tenant_id' => $tenant->id, 'key' => 'make_lead_webhook_secret', 'value' => 'existing-secret-value',
        ]);

        Http::fake(['eu1.make.com/api/v2/scenarios*' => Http::response(['scenario' => ['id' => 1]], 200)]);

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'sonia-crm'])->assertExitCode(0);

        $this->assertSame(
            'existing-secret-value',
            TenantSetting::where('tenant_id', $tenant->id)->where('key', 'make_lead_webhook_secret')->first()->value
        );
    }

    public function test_regenerate_secret_flag_rotates_existing_secret(): void
    {
        $this->configureMake();
        $tenant = Tenant::create(['name' => 'Sonia', 'subdomain' => 'sonia-crm', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        TenantSetting::create([
            'tenant_id' => $tenant->id, 'key' => 'make_lead_webhook_secret', 'value' => 'old-secret-value',
        ]);

        Http::fake(['eu1.make.com/api/v2/scenarios*' => Http::response(['scenario' => ['id' => 1]], 200)]);

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'sonia-crm', '--regenerate-secret' => true])
            ->assertExitCode(0);

        $newValue = TenantSetting::where('tenant_id', $tenant->id)->where('key', 'make_lead_webhook_secret')->first()->value;
        $this->assertNotSame('old-secret-value', $newValue);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $newValue);
    }

    public function test_make_api_failure_surfaces_error_and_aborts(): void
    {
        $this->configureMake();
        Tenant::create(['name' => 'Sonia', 'subdomain' => 'sonia-crm', 'status' => 'active']);

        Http::fake([
            'eu1.make.com/api/v2/scenarios*' => Http::response(['message' => 'Bad blueprint'], 422),
        ]);

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'sonia-crm'])
            ->assertExitCode(1)
            ->expectsOutputToContain('Bad blueprint');
    }

    public function test_unexpected_response_shape_aborts_without_printing_broken_url(): void
    {
        $this->configureMake();
        Tenant::create(['name' => 'Sonia', 'subdomain' => 'sonia-crm', 'status' => 'active']);

        Http::fake([
            'eu1.make.com/api/v2/scenarios*' => Http::response(['unexpected' => true], 200),
        ]);

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'sonia-crm'])
            ->assertExitCode(1)
            ->expectsOutputToContain('unexpected response');
    }

    public function test_connection_failure_is_handled_cleanly(): void
    {
        $this->configureMake();
        Tenant::create(['name' => 'Sonia', 'subdomain' => 'sonia-crm', 'status' => 'active']);

        Http::fake(function () {
            throw new \Illuminate\Http\Client\ConnectionException('Connection timed out');
        });

        $this->artisan('make:onboard-facebook-bridge', ['tenant' => 'sonia-crm'])
            ->assertExitCode(1)
            ->expectsOutputToContain('Make API error');
    }
}
