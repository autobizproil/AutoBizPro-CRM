<?php

namespace App\Services;

use App\Jobs\RunAutomationJob;
use App\Models\Automation;
use Illuminate\Database\Eloquent\Model;

class AutomationEngine
{
    public function fire(string $triggerType, Model $entity): void
    {
        $tenantId = app()->has('current_tenant_id') ? app('current_tenant_id') : $entity->tenant_id;

        $automations = Automation::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)
            ->where('trigger_type', $triggerType)
            ->where('active', true)
            ->get();

        foreach ($automations as $automation) {
            if ($this->conditionsPass($automation->conditions ?? [], $entity)) {
                RunAutomationJob::dispatchAfterResponse($automation->id, get_class($entity), $entity->id, $tenantId);
            }
        }
    }

    private function conditionsPass(array $conditions, Model $entity): bool
    {
        foreach ($conditions as $condition) {
            $field    = $condition['field'] ?? null;
            $operator = $condition['operator'] ?? '=';
            $value    = $condition['value'] ?? null;

            $entityValue = $entity->{$field} ?? null;

            $passes = match ($operator) {
                '='         => $entityValue == $value,
                '!='        => $entityValue != $value,
                'contains'  => str_contains((string) $entityValue, (string) $value),
                'not_empty' => ! empty($entityValue),
                'empty'     => empty($entityValue),
                default     => false,
            };

            if (! $passes) {
                return false;
            }
        }

        return true;
    }
}
