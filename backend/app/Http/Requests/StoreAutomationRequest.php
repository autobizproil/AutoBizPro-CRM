<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreAutomationRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'         => 'required|string|max:255',
            'trigger_type' => 'required|string|in:lead_created,lead_stage_changed,form_submitted,contact_created,client_created,call_received,whatsapp_received',
            'conditions'   => 'nullable|array',
            'actions'      => 'required|array|min:1',
            'actions.*.type' => 'required|string',
            'active'       => 'boolean',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required'        => 'שם האוטומציה הוא שדה חובה',
            'trigger_type.required' => 'סוג הטריגר הוא שדה חובה',
            'trigger_type.in'      => 'סוג טריגר לא חוקי',
            'actions.required'     => 'חובה להגדיר לפחות פעולה אחת',
            'actions.min'          => 'חובה להגדיר לפחות פעולה אחת',
        ];
    }
}
