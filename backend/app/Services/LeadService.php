<?php

namespace App\Services;

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

        return $query->latest()->paginate(25);
    }

    public function create(array $data): Lead
    {
        $lead = Lead::create($data);
        $this->automation->fire('lead_created', $lead);
        return $lead->load(['stage', 'assignedUser']);
    }

    public function update(Lead $lead, array $data): Lead
    {
        $oldStageId = $lead->pipeline_stage_id;
        $lead->update($data);

        if (isset($data['pipeline_stage_id']) && $data['pipeline_stage_id'] !== $oldStageId) {
            $this->automation->fire('lead_stage_changed', $lead);
        }

        return $lead->fresh(['stage', 'assignedUser']);
    }

    public function changeStage(Lead $lead, int $stageId): Lead
    {
        $lead->update(['pipeline_stage_id' => $stageId]);
        $this->automation->fire('lead_stage_changed', $lead->fresh());
        return $lead->fresh(['stage']);
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
