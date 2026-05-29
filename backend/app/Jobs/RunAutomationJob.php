<?php

namespace App\Jobs;

use App\Models\Automation;
use App\Models\AutomationLog;
use App\Models\Lead;
use App\Models\PipelineStage;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

// Queue driver: database (Phase 1). Migrate to Redis before scaling to production load.
class RunAutomationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 3;
    public int $timeout = 60;

    public function __construct(
        private int    $automationId,
        private string $entityClass,
        private int    $entityId,
        private int    $tenantId,
    ) {}

    public function handle(NotificationService $notifications): void
    {
        app()->instance('current_tenant_id', $this->tenantId);

        $automation = Automation::withoutGlobalScope('tenant')->find($this->automationId);
        $entity     = $this->entityClass::withoutGlobalScope('tenant')->find($this->entityId);

        if (! $automation || ! $entity) {
            return;
        }

        try {
            foreach ($automation->actions as $action) {
                $this->executeAction($action, $entity, $notifications);
            }

            AutomationLog::create([
                'automation_id' => $this->automationId,
                'entity_type'   => class_basename($this->entityClass),
                'entity_id'     => $this->entityId,
                'status'        => 'success',
                'ran_at'        => now(),
            ]);
        } catch (\Throwable $e) {
            AutomationLog::create([
                'automation_id' => $this->automationId,
                'entity_type'   => class_basename($this->entityClass),
                'entity_id'     => $this->entityId,
                'status'        => 'failed',
                'error_message' => $e->getMessage(),
                'ran_at'        => now(),
            ]);

            Log::error("Automation #{$this->automationId} failed: " . $e->getMessage());
            throw $e; // triggers retry
        }
    }

    private function executeAction(array $action, $entity, NotificationService $notifications): void
    {
        $context = $entity->toArray();

        match ($action['type']) {
            'send_email'    => $notifications->sendEmail($this->tenantId, $action, $context),
            'send_whatsapp' => $notifications->sendWhatsapp($this->tenantId, $action, $context),
            'assign_to'     => $entity->update(['assigned_to' => $action['user_id']]),
            'change_stage'  => $entity instanceof Lead
                                ? $entity->update(['pipeline_stage_id' => $action['stage_id']])
                                : null,
            'add_tag'       => $this->addTag($entity, $action['tag']),
            'create_activity' => \App\Models\Activity::create([
                'tenant_id'   => $this->tenantId,
                'entity_type' => strtolower(class_basename($entity)),
                'entity_id'   => $entity->id,
                'type'        => $action['activity_type'] ?? 'note',
                'body'        => $action['title'] ?? 'אוטומציה',
                'user_id'     => null,
            ]),
            default => Log::warning("Unknown automation action: {$action['type']}"),
        };
    }

    private function addTag($entity, string $tag): void
    {
        $tags = $entity->tags ?? [];
        if (! in_array($tag, $tags)) {
            $entity->update(['tags' => array_merge($tags, [$tag])]);
        }
    }
}
