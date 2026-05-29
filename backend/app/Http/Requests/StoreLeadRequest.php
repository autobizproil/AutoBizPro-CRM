<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreLeadRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'               => 'required|string|max:255',
            'phone'              => 'nullable|string|max:30',
            'email'              => 'nullable|email|max:255',
            'status'             => 'nullable|string|max:50',
            'pipeline_stage_id'  => 'nullable|integer|exists:pipeline_stages,id',
            'assigned_to'        => 'nullable|integer|exists:users,id',
            'source'             => 'nullable|string|max:100',
            'notes'              => 'nullable|string',
            'custom_fields'      => 'nullable|array',
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
