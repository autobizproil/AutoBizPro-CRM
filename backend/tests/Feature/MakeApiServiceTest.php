<?php

namespace Tests\Feature;

use App\Services\Integrations\MakeApiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MakeApiServiceTest extends TestCase
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

    public function test_create_scenario_sends_correct_request_and_returns_response(): void
    {
        $this->configureMake();

        Http::fake([
            'eu1.make.com/api/v2/scenarios*' => Http::response([
                'scenario' => ['id' => 999, 'name' => 'Test Scenario'],
            ], 200),
        ]);

        $blueprint = ['name' => 'Test Scenario', 'flow' => [], 'metadata' => ['version' => 1]];

        $service = app(MakeApiService::class);
        $result  = $service->createScenario('Test Scenario', $blueprint);

        $this->assertSame(999, $result['scenario']['id']);

        Http::assertSent(function ($request) {
            return $request->url() === 'https://eu1.make.com/api/v2/scenarios?teamId=1047106'
                && $request->method() === 'POST'
                && $request->hasHeader('Authorization', 'Token test-token-abc')
                && $request['blueprint'] === json_encode(['name' => 'Test Scenario', 'flow' => [], 'metadata' => ['version' => 1]])
                && $request['scheduling'] === json_encode(['type' => 'on-demand']);
        });
    }

    public function test_create_scenario_throws_with_make_error_body_on_failure(): void
    {
        $this->configureMake();

        Http::fake([
            'eu1.make.com/api/v2/scenarios*' => Http::response([
                'message' => 'Insufficient rights, admin permission "organization view" is needed.',
            ], 403),
        ]);

        $service = app(MakeApiService::class);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Insufficient rights, admin permission "organization view" is needed.');

        $service->createScenario('Test Scenario', ['name' => 'Test Scenario', 'flow' => [], 'metadata' => ['version' => 1]]);
    }
}
