<?php

namespace App\Services;

use App\Jobs\SendOutgoingWebhook;
use App\Models\Lead;
use App\Services\AutomationEngine;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class LeadService
{
    public function __construct(private AutomationEngine $automation) {}

    // System fields a filter condition may target directly (not custom_fields JSON)
    private const FILTERABLE_FIELDS = ['name', 'phone', 'email', 'source', 'status', 'pipeline_stage_id', 'assigned_to', 'created_at'];
    private const FILTER_OPERATORS  = ['equals', 'not_equals', 'contains', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty'];

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
        foreach ($conditions as $cond) {
            $field    = $cond['field'] ?? null;
            $operator = $cond['operator'] ?? null;
            $value    = $cond['value'] ?? null;

            if (! $field || ! in_array($operator, self::FILTER_OPERATORS, true)) {
                continue;
            }

            $isCustom = str_starts_with((string) $field, 'cf_') && preg_match('/^cf_[a-z0-9_]+$/', $field);
            if (! $isCustom && ! in_array($field, self::FILTERABLE_FIELDS, true)) {
                continue;
            }

            $column = $isCustom
                ? DB::raw("JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$.\"" . substr($field, 3) . "\"'))")
                : $field;

            match ($operator) {
                'equals'     => $query->where($column, '=', $value),
                'not_equals' => $query->where($column, '!=', $value),
                'contains'   => $query->where($column, 'like', "%{$value}%"),
                'gt'         => $query->where($column, '>', $value),
                'gte'        => $query->where($column, '>=', $value),
                'lt'         => $query->where($column, '<', $value),
                'lte'        => $query->where($column, '<=', $value),
                'empty'      => $query->where(fn ($q) => $q->whereNull($column)->orWhere($column, '=', '')),
                'not_empty'  => $query->where(fn ($q) => $q->whereNotNull($column)->where($column, '!=', '')),
                default      => null,
            };
        }
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
