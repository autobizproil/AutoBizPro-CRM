<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ActivateFacebookBridgeCommandTest extends TestCase
{
    use RefreshDatabase;

    private function configureMake(): void
    {
        config([
            'services.make.api_token'    => 'test-token-abc',
            'services.make.team_id'      => 1047106,
            'services.make.api_base_url' => 'https://eu1.make.com/api/v2',
        ]);
    }

    public function test_missing_make_config_aborts_before_any_api_call(): void
    {
        config(['services.make.api_token' => null]);

        Http::fake();

        $this->artisan('make:activate-facebook-bridge', ['scenario_id' => '555'])
            ->assertExitCode(1)
            ->expectsOutputToContain('MAKE_API_TOKEN');

        Http::assertNothingSent();
    }

    public function test_activates_scenario_successfully(): void
    {
        $this->configureMake();

        Http::fake(['eu1.make.com/api/v2/scenarios/555/start*' => Http::response(['scenario' => ['id' => 555]], 200)]);

        $this->artisan('make:activate-facebook-bridge', ['scenario_id' => '555'])
            ->assertExitCode(0)
            ->expectsOutputToContain('activated');
    }

    public function test_make_api_failure_surfaces_error_and_aborts(): void
    {
        $this->configureMake();

        Http::fake(['eu1.make.com/api/v2/scenarios/555/start*' => Http::response(['message' => 'Scenario not found'], 404)]);

        $this->artisan('make:activate-facebook-bridge', ['scenario_id' => '555'])
            ->assertExitCode(1)
            ->expectsOutputToContain('Scenario not found');
    }
}
