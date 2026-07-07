<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreApiTokenRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // route-level permission middleware gates access
    }

    public function rules(): array
    {
        return [
            'name'        => 'required|string|max:100',
            'abilities'   => 'required|array|min:1',
            'abilities.*' => 'in:crm:read,crm:write',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required'      => 'שם הטוקן הוא שדה חובה',
            'abilities.required' => 'יש לבחור לפחות הרשאה אחת',
            'abilities.*.in'     => 'הרשאה לא חוקית — מותר crm:read או crm:write בלבד',
        ];
    }
}
