<?php

namespace App\Console\Commands;

use App\Services\Integrations\MakeApiService;
use Illuminate\Console\Command;

class ActivateFacebookBridge extends Command
{
    protected $signature = 'make:activate-facebook-bridge {scenario_id}';

    protected $description = 'Activate a Make.com Facebook Lead Ads bridge scenario after its trigger has been manually connected to a customer\'s Facebook Page + form';

    public function handle(MakeApiService $makeApi): int
    {
        if (empty(config('services.make.api_token'))) {
            $this->error('MAKE_API_TOKEN is not configured — set it in .env before running this command.');
            return 1;
        }

        $scenarioId = (int) $this->argument('scenario_id');

        try {
            $makeApi->activateScenario($scenarioId);
        } catch (\Throwable $e) {
            $this->error('Make API error: ' . $e->getMessage());
            return 1;
        }

        $this->info("Scenario {$scenarioId} activated.");

        return 0;
    }
}
