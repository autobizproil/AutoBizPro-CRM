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

    // Whitelisted date columns a drill-down's date_field may target (matches EntityDescriptor's lead dateFields)
    private const DATE_FIELDS = ['created_at', 'updated_at'];

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
        $dateField = ! empty($filters['date_field']) && in_array($filters['date_field'], self::DATE_FIELDS, true)
            ? $filters['date_field']
            : 'created_at';

        if (! empty($filters['date_from'])) {
            $query->where($dateField, '>=', $filters['date_from']);
        }
        if (! empty($filters['date_to'])) {
            $query->where($dateField, '<=', $filters['date_to']);
        }

        $this->applyConditions($query, $filters['conditions'] ?? []);
        $this->applyOrConditions($query, $filters['orConditions'] ?? []);

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

    /**
     * Apply the OR-group condition filter (mirrors WidgetDataService::aggregate()'s
     * orConditions handling — the whole group is wrapped in its own where-closure so
     * it stays isolated from the AND-group conditions above).
     */
    private function applyOrConditions($query, array $orConditions): void
    {
        if (empty($orConditions)) {
            return;
        }

        $query->where(function ($q) use ($orConditions) {
            ConditionFilter::apply($q, $orConditions, self::FILTERABLE_FIELDS, 'custom_fields', false, 'or');
        });
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

        // change_stage/assign need per-lead event firing, which a mass query-builder
        // update skips entirely (Eloquent model events don't fire on it) — so these
        // branches can't be one-line match() arms like the others.
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

        if ($action === 'assign') {
            $assignee   = (int) $value;
            $changedIds = (clone $query)->where('assigned_to', '!=', $assignee)->pluck('id');
            $count      = $query->update(['assigned_to' => $assignee]);

            if ($changedIds->isNotEmpty()) {
                $observer = app(\App\Observers\LeadObserver::class);
                Lead::whereIn('id', $changedIds)->get()->each(
                    fn (Lead $lead) => $observer->dispatch($lead, 'lead_updated')
                );
            }

            return $count;
        }

        return match ($action) {
            'delete' => $query->delete(), // soft delete
            default  => 0,
        };
    }
}
