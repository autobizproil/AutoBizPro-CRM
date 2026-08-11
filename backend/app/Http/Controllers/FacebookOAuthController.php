<?php

namespace App\Http\Controllers;

use App\Services\Integrations\FacebookOAuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Laravel\Socialite\Facades\Socialite;

/**
 * Facebook Lead Ads — OAuth connect. Replaces manual app_id/secret/page_id entry
 * with a one-click flow that also performs the Page→App webhook subscription that
 * has no reliable manual UI path (see docs/superpowers/specs/2026-08-11-facebook-oauth-lead-ads-design.md).
 */
class FacebookOAuthController extends Controller
{
    public function redirect(): RedirectResponse
    {
        return Socialite::driver('facebook')
            ->scopes(['pages_show_list', 'pages_read_engagement', 'pages_manage_metadata', 'leads_retrieval'])
            ->redirect();
    }

    public function callback(Request $request, FacebookOAuthService $svc): JsonResponse
    {
        if ($request->query('error') === 'access_denied') {
            return response()->json(['success' => false, 'message' => 'ההתחברות בוטלה']);
        }

        $socialiteUser = Socialite::driver('facebook')->user();
        $longLivedToken = $svc->exchangeLongLivedToken($socialiteUser->token);
        $pages = $svc->fetchPages($longLivedToken);

        if (empty($pages)) {
            return response()->json(['success' => false, 'message' => 'לא נמצאו עמודים שאתה מנהל']);
        }

        if (count($pages) > 1) {
            $request->session()->put('facebook_oauth_pages', $pages);
            return response()->json([
                'success' => true,
                'status'  => 'choose_page',
                'pages'   => array_map(fn (array $p) => ['id' => $p['id'], 'name' => $p['name']], $pages),
            ]);
        }

        $result = $svc->connectPage($pages[0], app('current_tenant_id'));
        return response()->json(['success' => true, 'status' => 'connected'] + $result);
    }

    public function selectPage(Request $request, FacebookOAuthService $svc): JsonResponse
    {
        $data = $request->validate(['page_id' => 'required|string']);
        $pages = $request->session()->get('facebook_oauth_pages', []);
        $page = collect($pages)->firstWhere('id', $data['page_id']);

        if (!$page) {
            return response()->json(['success' => false, 'message' => 'העמוד שנבחר לא נמצא, נסה להתחבר שוב'], 404);
        }

        $result = $svc->connectPage($page, app('current_tenant_id'));
        $request->session()->forget('facebook_oauth_pages');
        return response()->json(['success' => true, 'status' => 'connected'] + $result);
    }
}
