<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'     => 'required|string|max:255',
            'email'    => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:8',
            'role'     => 'required|in:admin,manager,agent',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required'     => 'שם המשתמש הוא שדה חובה',
            'email.required'    => 'כתובת אימייל היא שדה חובה',
            'email.email'       => 'כתובת אימייל לא תקינה',
            'email.unique'      => 'כתובת האימייל כבר קיימת במערכת',
            'password.required' => 'סיסמה היא שדה חובה',
            'password.min'      => 'הסיסמה חייבת להכיל לפחות 8 תווים',
            'role.required'     => 'תפקיד הוא שדה חובה',
            'role.in'           => 'תפקיד לא חוקי',
        ];
    }
}
