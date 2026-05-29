<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreFormRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'                    => 'required|string|max:255',
            'fields'                  => 'required|array|min:1',
            'fields.*.label'          => 'required|string',
            'fields.*.type'           => 'required|string|in:text,email,phone,textarea,select,checkbox',
            'fields.*.required'       => 'nullable|boolean',
            'destination_pipeline_id' => 'nullable|integer|exists:pipeline_stages,id',
            'active'                  => 'boolean',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required'       => 'שם הטופס הוא שדה חובה',
            'fields.required'     => 'חובה להגדיר לפחות שדה אחד',
            'fields.min'          => 'חובה להגדיר לפחות שדה אחד',
            'fields.*.label.required' => 'כל שדה חייב להכיל תווית',
            'fields.*.type.in'    => 'סוג שדה לא חוקי',
        ];
    }
}
