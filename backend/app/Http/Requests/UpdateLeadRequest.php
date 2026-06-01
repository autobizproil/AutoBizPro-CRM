<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateLeadRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $tenantId = app('current_tenant_id');

        return [
            'name'              => 'sometimes|required|string|max:255',
            'phone'             => 'nullable|string|max:30',
            'email'             => 'nullable|email|max:255',
            'status'            => 'nullable|in:NEW_LEAD,DISCOVERY_CALL,PROPOSAL_SENT,CONTRACT_PENDING,WON,LOST',
            'pipeline_stage_id' => ['nullable', 'integer', Rule::exists('pipeline_stages', 'id')->where('tenant_id', $tenantId)],
            'assigned_to'       => ['nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tenantId)],
            'source'            => 'nullable|string|max:100',
            'notes'             => 'nullable|string',
            'custom_fields'     => 'nullable|array',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'שם הליד הוא שדה חובה',
            'email.email'   => 'כתובת אימייל לא תקינה',
        ];
    }
}
