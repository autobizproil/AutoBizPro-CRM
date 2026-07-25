<?php

namespace App\Services;

use App\Models\Lead;
use App\Services\AutomationEngine;
use App\Services\ConditionFilter;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class LeadService
{
    // System fields a filter condition may target directly (not custom_fields JSON)
    private const FILTERABLE_FIELDS = ['name', 'phone', 'email', 'source', 'status', 'pipeline_stage_id', 'assigned_to', 'created_at'];

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
        if (! empty($filters['date_from'])) {
            $query->where('created_at', '>=', $filters['date_from']);
        }
        if (! empty($filters['date_to'])) {
            $query->where('created_at', '<=', $filters['date_to']);
        }

        $this->applyConditions($query, $filters['conditions'] ?? []);

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

    /**
     * Apply Fireberry-style multi-condition filters.
     * Each condition: { field, operator, value }. field is either a whitelisted
     * system column, or 'cf_<name>' targeting the custom_fields JSON column.
     *
     * @param  array<int, array{field?: string, operator?: string, value?: mixed}>  $conditions
     */
    private function applyConditions($query, array $conditions): void
    {
        ConditionFilter::apply($query, $conditions, self::FILTERABLE_FIELDS, 'custom_fields');
    }

    public function create(array $data): Lead
    {
        $lead = Lead::create($data); // LeadObserver::created() fires the outgoing webhook + lead_created automations
        return $lead->load(['stage', 'assignedUser']);
    }

    public function update(Lead $lead, array $data): Lead
    {
        $lead->update($data); // LeadObserver::updated() fires the outgoing webhook + stage/status-changed automations
        return $lead->fresh(['stage', 'assignedUser']);
    }

    public function changeStage(Lead $lead, int $stageId): Lead
    {
        $lead->update(['pipeline_stage_id' => $stageId]); // LeadObserver::updated() fires the outgoing webhook + lead_stage_changed automations
        return $lead->fresh(['stage', 'assignedUser']);
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

        // change_stage needs per-lead automation firing, which a mass query-builder
        // update skips entirely (Eloquent model events don't fire on it) — so this
        // branch can't be a one-line match() arm like the others.
        if ($action === 'change_stage') {
            $stageId = (int) $value;
            $changedIds = (clone $query)->where('pipeline_stage_id', '!=', $stageId)->pluck('id');
            $count = $query->update(['pipeline_stage_id' => $stageId]);

            if ($changedIds->isNotEmpty()) {
                $automation = app(AutomationEngine::class);
                Lead::whereIn('id', $changedIds)->get()->each(
                    fn (Lead $lead) => $automation->fire('lead_stage_changed', $lead)
                );
            }

            return $count;
        }

        return match ($action) {
            'assign' => $query->update(['assigned_to' => (int) $value]),
            'delete' => $query->delete(), // soft delete
            default  => 0,
        };
    }
}
