<?php

namespace App\Services;

use App\Jobs\SendOutgoingWebhook;
use App\Models\Lead;
use App\Services\AutomationEngine;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class LeadService
{
    public function __construct(private AutomationEngine $automation) {}

    public function list(array $filters, int $userId, string $role): LengthAwarePaginator
    {
        $query = Lead::with(['stage', 'assignedUser']);

        if ($role === 'agent') {
            $query->ownedBy($userId);
        }

        if (! empty($filters['stage_id'])) {
            $query->where('pipeline_stage_id', $filters['stage_id']);
        }
        if (! empty($filters['assigned_to'])) {
            $query->where('assigned_to', $filters['assigned_to']);
        }
        if (! empty($filters['source'])) {
            $query->where('source', $filters['source']);
        }
        if (! empty($filters['search'])) {
            $q = $filters['search'];
            $query->where(fn ($q2) => $q2->where('name', 'like', "%$q%")
                ->orWhere('email', 'like', "%$q%")
                ->orWhere('phone', 'like', "%$q%"));
        }

        // Sorting — whitelisted columns only; JSON path for custom fields
        $sortable = ['name', 'phone', 'email', 'source', 'created_at', 'pipeline_stage_id', 'assigned_to'];
        $sortBy   = $filters['sort_by'] ?? null;
        $sortDir  = strtolower($filters['sort_dir'] ?? 'desc') === 'asc' ? 'asc' : 'desc';

        if ($sortBy && in_array($sortBy, $sortable, true)) {
            $query->orderBy($sortBy, $sortDir);
        } elseif ($sortBy && str_starts_with($sortBy, 'cf_') && preg_match('/^cf_[a-z0-9_]+$/', $sortBy)) {
            $query->orderByRaw("JSON_UNQUOTE(JSON_EXTRACT(custom_fields, ?)) {$sortDir}", ['$."' . $sortBy . '"']);
        } else {
            $query->latest();
        }

        return $query->paginate(25);
    }

    public function create(array $data): Lead
    {
        $lead = Lead::create($data);
        $this->automation->fire('lead_created', $lead);
        $loaded = $lead->load(['stage', 'assignedUser']);
        $this->webhook($loaded, 'lead_created');
        return $loaded;
    }

    public function update(Lead $lead, array $data): Lead
    {
        $oldStageId = $lead->pipeline_stage_id;
        $oldStatus  = $lead->status;
        $lead->update($data);

        if (isset($data['pipeline_stage_id']) && $data['pipeline_stage_id'] !== $oldStageId) {
            $this->automation->fire('lead_stage_changed', $lead);
        }

        if (isset($data['status']) && $data['status'] !== $oldStatus) {
            $this->automation->fire('lead_status_changed', $lead);
        }

        $fresh = $lead->fresh(['stage', 'assignedUser']);

        $event = isset($data['status']) && $data['status'] !== $oldStatus
            ? 'status_changed'
            : (isset($data['pipeline_stage_id']) && $data['pipeline_stage_id'] !== $oldStageId
                ? 'stage_changed'
                : 'lead_updated');

        $this->webhook($fresh, $event);
        return $fresh;
    }

    public function changeStage(Lead $lead, int $stageId): Lead
    {
        $lead->update(['pipeline_stage_id' => $stageId]);
        $fresh = $lead->fresh(['stage', 'assignedUser']);
        $this->automation->fire('lead_stage_changed', $fresh);
        $this->webhook($fresh, 'stage_changed');
        return $fresh;
    }

    // Dispatch webhook after response — zero impact on request latency
    private function webhook(Lead $lead, string $event): void
    {
        $hasSetting = ! empty(app(\App\Services\SettingsService::class)->get('outgoing_webhook_url'));
        $hasEnv     = ! empty(config('services.webhook.target_url'));
        if (! $hasSetting && ! $hasEnv) {
            return;
        }
        SendOutgoingWebhook::dispatchAfterResponse($lead, $event);
    }

    /**
     * Apply an action to many leads at once. The tenant global scope on Lead
     * guarantees only the current tenant's leads are ever touched. Agents are
     * further restricted to leads assigned to them.
     *
     * @param  array<int>  $ids
     */
    public function bulk(string $action, array $ids, $value, int $userId, string $role): int
    {
        $query = Lead::whereIn('id', $ids);
        if ($role === 'agent') {
            $query->where('assigned_to', $userId);
        }

        return match ($action) {
            'change_stage' => $query->update(['pipeline_stage_id' => (int) $value]),
            'assign'       => $query->update(['assigned_to' => (int) $value]),
            'delete'       => $query->delete(), // soft delete
            default        => 0,
        };
    }
}
