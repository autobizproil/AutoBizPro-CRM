<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
        ], [
            'email.required'    => 'כתובת אימייל היא שדה חובה',
            'email.email'       => 'כתובת אימייל לא תקינה',
            'password.required' => 'סיסמה היא שדה חובה',
        ]);

        if (! Auth::attempt($credentials, true)) {
            return response()->json([
                'success' => false,
                'message' => 'אימייל או סיסמה שגויים',
                'code'    => 401,
            ], 401);
        }

        $user = Auth::user();

        // Service users exist only to hold agent API tokens — interactive login is never valid
        if ($user->is_service) {
            Auth::guard('web')->logout();
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return response()->json([
                'success' => false,
                'message' => 'Forbidden',
                'code'    => 403,
            ], 403);
        }

        if ($user->status === 'inactive') {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'success' => false,
                'message' => 'המשתמש אינו פעיל',
                'code'    => 403,
            ], 403);
        }

        // Sanctum SPA — cookie is set automatically, return user + permissions
        return response()->json([
            'success' => true,
            'data'    => [
                'user'        => $user,
                'permissions' => $this->getPermissions($user),
            ],
        ]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
        ], [
            'email.required' => 'כתובת אימייל היא שדה חובה',
            'email.email'    => 'כתובת אימייל לא תקינה',
        ]);

        $genericResponse = response()->json([
            'success' => true,
            'message' => 'אם קיים חשבון עם כתובת אימייל זו, נשלח אליו קישור לאיפוס סיסמה',
        ]);

        $user = User::where('email', $request->email)->where('is_service', false)->first();
        if (! $user) {
            return $genericResponse;
        }

        $token = Str::random(64);
        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $user->email],
            ['token' => Hash::make($token), 'created_at' => now()]
        );

        $resetUrl = $request->getSchemeAndHttpHost() . '/reset-password?token=' . $token . '&email=' . urlencode($user->email);

        Mail::raw("לחצו על הקישור הבא לאיפוס הסיסמה שלכם: {$resetUrl}\n\nהקישור בתוקף ל-60 דקות.", function ($msg) use ($user) {
            $msg->to($user->email)->subject('איפוס סיסמה - AutoBizPro CRM');
        });

        return $genericResponse;
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => 'required|email',
            'token'    => 'required|string',
            'password' => 'required|string|min:8|confirmed',
        ], [
            'email.required'    => 'כתובת אימייל היא שדה חובה',
            'token.required'    => 'קישור לא תקין',
            'password.required' => 'סיסמה היא שדה חובה',
            'password.min'      => 'הסיסמה חייבת להכיל לפחות 8 תווים',
            'password.confirmed' => 'הסיסמאות אינן תואמות',
        ]);

        $row = DB::table('password_reset_tokens')->where('email', $request->email)->first();

        if (! $row || ! Hash::check($request->token, $row->token)) {
            return response()->json([
                'success' => false,
                'message' => 'קישור איפוס לא תקין או שפג תוקפו',
                'code'    => 422,
            ], 422);
        }

        if (now()->diffInMinutes($row->created_at) > 60) {
            DB::table('password_reset_tokens')->where('email', $request->email)->delete();
            return response()->json([
                'success' => false,
                'message' => 'קישור איפוס לא תקין או שפג תוקפו',
                'code'    => 422,
            ], 422);
        }

        $user = User::where('email', $request->email)->first();
        if (! $user) {
            return response()->json([
                'success' => false,
                'message' => 'קישור איפוס לא תקין או שפג תוקפו',
                'code'    => 422,
            ], 422);
        }

        $user->update(['password' => $request->password]);
        DB::table('password_reset_tokens')->where('email', $request->email)->delete();

        return response()->json(['success' => true, 'data' => null]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['success' => true, 'data' => null]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated'], 401);
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'user'        => $user,
                'permissions' => $this->getPermissions($user),
            ],
        ]);
    }

    private function getPermissions($user): array
    {
        $modules = ['leads', 'contacts', 'automations', 'forms', 'users', 'reports'];
        $actions = ['can_create', 'can_read', 'can_update', 'can_delete'];
        $perms   = [];

        foreach ($modules as $module) {
            foreach ($actions as $action) {
                $perms[$module][$action] = \App\Models\RolePermission::defaultFor($user->role, $module, $action);
            }
        }

        return $perms;
    }
}
