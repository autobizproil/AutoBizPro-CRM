<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Services\Integrations\MakeApiService;
use App\Services\SettingsService;
use Illuminate\Console\Command;

class OnboardFacebookBridge extends Command
{
    protected $signature = 'make:onboard-facebook-bridge {tenant} {--regenerate-secret}';

    protected $description = 'Provision a Make.com Facebook Lead Ads bridge scenario for a tenant (secret + scenario, everything short of the customer\'s own Facebook page connection)';

    public function handle(MakeApiService $makeApi): int
    {
        $tenantModel = Tenant::where('subdomain', $this->argument('tenant'))->first();
        if (!$tenantModel) {
            $this->error("Tenant '{$this->argument('tenant')}' not found.");
            return 1;
        }

        if (empty(config('services.make.api_token'))) {
            $this->error('MAKE_API_TOKEN is not configured — set it in .env before running this command.');
            return 1;
        }
        if (empty(config('services.make.team_id'))) {
            $this->error('MAKE_TEAM_ID is not configured — set it in .env before running this command.');
            return 1;
        }

        app()->instance('current_tenant_id', $tenantModel->id);
        $settings = app(SettingsService::class);

        $existingSecret = $settings->get('make_lead_webhook_secret');
        if ($existingSecret && !$this->option('regenerate-secret')) {
            $secret = $existingSecret;
            $this->info('Reusing existing make_lead_webhook_secret.');
        } else {
            $secret = bin2hex(random_bytes(32));
            $settings->set('make_lead_webhook_secret', $secret);
            $this->info($existingSecret ? 'Rotated make_lead_webhook_secret.' : 'Generated new make_lead_webhook_secret.');
        }

        $endpointUrl = rtrim(config('app.url'), '/') . '/api/integrations/make/lead/' . $tenantModel->subdomain;
        $scenarioName = "{$tenantModel->name} - Facebook Lead Ads Bridge";

        $blueprint = [
            'name' => $scenarioName,
            'flow' => [
                [
                    'id' => 1,
                    'module' => 'facebook-lead-ads:WatchLeads',
                    'version' => 2,
                    // Make's schema requires {} not [] here — PHP's json_encode() emits [] for
                    // an empty array, so this must be an object explicitly.
                    'parameters' => (object) [],
                    'mapper' => (object) [],
                    'metadata' => ['designer' => ['x' => 0, 'y' => 0]],
                ],
                [
                    'id' => 2,
                    'module' => 'http:ActionSendData',
                    'version' => 3,
                    'parameters' => ['handleErrors' => false, 'useNewZLibDeCompress' => true],
                    // Full field set required by Make's http:ActionSendData v3 schema — confirmed
                    // against the real working blueprint built by hand for sonia-crm this session.
                    // A partial mapper (missing any of these) fails scenario save with
                    // BundleValidationError "Missing value of required parameter '...'".
                    'mapper' => [
                        'url' => $endpointUrl,
                        'serializeUrl' => false,
                        'method' => 'post',
                        'headers' => [
                            ['name' => 'X-Webhook-Secret', 'value' => $secret],
                            ['name' => 'Content-Type', 'value' => 'application/json'],
                        ],
                        'qs' => [],
                        'bodyType' => 'raw',
                        'parseResponse' => true,
                        'authUser' => '',
                        'authPass' => '',
                        'timeout' => '',
                        'shareCookies' => false,
                        'ca' => '',
                        'rejectUnauthorized' => true,
                        'followRedirect' => true,
                        'useQuerystring' => false,
                        'gzip' => true,
                        'useMtls' => false,
                        'contentType' => 'application/json',
                        'data' => "{\n  \"name\": \"{{1.data.full_name}}\",\n  \"phone\": \"{{1.data.phone_number}}\",\n  \"email\": \"{{1.data.email}}\",\n  \"form_name\": \"\"\n}",
                        'followAllRedirects' => false,
                    ],
                    'metadata' => ['designer' => ['x' => 300, 'y' => 0]],
                ],
            ],
            'metadata' => ['version' => 1],
        ];

        try {
            $result = $makeApi->createScenario($scenarioName, $blueprint);
        } catch (\Throwable $e) {
            $this->error('Make API error: ' . $e->getMessage());
            return 1;
        }

        $scenarioId = $result['scenario']['id'] ?? null;
        if ($scenarioId === null) {
            $this->error('Make returned an unexpected response: ' . json_encode($result));
            return 1;
        }

        $teamId = config('services.make.team_id');
        $scenarioUrl = "https://eu1.make.com/{$teamId}/scenarios/{$scenarioId}";

        $this->info("Scenario created: {$scenarioUrl}");
        $this->info("Secret: {$secret}");
        $this->info("Next step (manual, unavoidable): open the scenario above, connect {$tenantModel->name}'s Facebook Page + lead form in the first module, then Activate.");

        return 0;
    }
}
