<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreContactRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'          => 'required|string|max:255',
            'phone'         => 'nullable|string|max:30',
            'email'         => 'nullable|email|max:255',
            'company'       => 'nullable|string|max:255',
            'role'          => 'nullable|string|max:100',
            'notes'         => 'nullable|string',
            'tags'          => 'nullable|array',
            'custom_fields' => 'nullable|array',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'שם איש הקשר הוא שדה חובה',
            'email.email'   => 'כתובת אימייל לא תקינה',
        ];
    }
}
