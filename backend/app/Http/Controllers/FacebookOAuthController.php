<?php

namespace App\Http\Controllers;

use App\Services\Integrations\FacebookOAuthService;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Laravel\Socialite\Facades\Socialite;

/**
 * Facebook Lead Ads — OAuth connect. Replaces manual app_id/secret/page_id entry
 * with a one-click flow that also performs the Page→App webhook subscription that
 * has no reliable manual UI path (see docs/superpowers/specs/2026-08-11-facebook-oauth-lead-ads-design.md).
 *
 * callback() and selectPage() are deliberately NOT behind auth:sanctum — callback()
 * is the literal URL Facebook's browser redirects to after consent, a cross-origin
 * top-level navigation that never carries this app's session cookie (Sanctum's
 * stateful check is Referer/Origin-based, and facebook.com never matches). Tenant
 * identity instead travels in a signed, encrypted `state`/`pages_token` value — see
 * the "OAuth callback identity" section of the design doc for the full reasoning.
 */
class FacebookOAuthController extends Controller
{
    private const TOKEN_TTL_SECONDS = 600; // 10 minutes — bounds the whole redirect round-trip

    /** GET — user-initiated, same-origin, normal authenticated request. */
    public function redirect(): RedirectResponse
    {
        $state = Crypt::encryptString(json_encode([
            'tenant_id'  => app('current_tenant_id'),
            'expires_at' => now()->addSeconds(self::TOKEN_TTL_SECONDS)->timestamp,
        ]));

        // Delegation-based connect (see docs/superpowers/specs/2026-08-20-facebook-delegation-lead-ads-design.md)
        // requests these permissions as classic OAuth scopes on AutoBizPro's own app, rather than
        // via the Facebook Login for Business config_id/Configuration picker that never surfaced
        // leads_retrieval/pages_manage_metadata as choosable (see that spec's "Open assumption"
        // section — this switch is the working hypothesis for what actually unblocks Meta, not a
        // confirmed fix).
        return Socialite::driver('facebook')
            ->stateless()
            ->setScopes([
                'ads_read',
                'pages_show_list',
                'leads_retrieval',
                'pages_manage_ads',
                'business_management',
                'pages_read_user_content',
                'pages_manage_metadata',
            ])
            ->with(['state' => $state])
            ->redirect();
    }

    /** GET — hit directly by Facebook's cross-origin redirect. No auth, no session. */
    public function callback(Request $request, FacebookOAuthService $svc): RedirectResponse
    {
        if ($request->has('error')) {
            return $this->toSettings(['fb_status' => 'error', 'fb_message' => 'ההתחברות בוטלה']);
        }

        $tenantId = $this->decode($request->query('state', ''))['tenant_id'] ?? null;
        if ($tenantId === null) {
            return $this->toSettings(['fb_status' => 'error', 'fb_message' => 'קישור לא תקין או שפג תוקפו, נסה שוב']);
        }
        app()->instance('current_tenant_id', $tenantId);

        try {
            $socialiteUser = Socialite::driver('facebook')->stateless()->user();
            $longLivedToken = $svc->exchangeLongLivedToken($socialiteUser->token);
            $pages = $svc->fetchPages($longLivedToken);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Facebook OAuth: callback failed', ['error' => $e->getMessage()]);
            return $this->toSettings(['fb_status' => 'error', 'fb_message' => 'ההתחברות נכשלה, נסה שוב']);
        }

        if (empty($pages)) {
            return $this->toSettings(['fb_status' => 'error', 'fb_message' => 'לא נמצאו עמודים שאתה מנהל']);
        }

        if (count($pages) > 1) {
            $pagesToken = Crypt::encryptString(json_encode([
                'tenant_id'          => $tenantId,
                'pages'              => $pages,
                'user_access_token'  => $longLivedToken,
                'expires_at'         => now()->addSeconds(self::TOKEN_TTL_SECONDS)->timestamp,
            ]));
            return $this->toSettings([
                'fb_status'      => 'choose_page',
                'fb_pages_token' => $pagesToken,
                'fb_pages'       => json_encode(array_map(fn (array $p) => ['id' => $p['id'], 'name' => $p['name']], $pages)),
            ]);
        }

        $result = $svc->connectPage($pages[0] + ['user_access_token' => $longLivedToken], $tenantId);
        return $this->toSettings([
            'fb_status'     => 'connected',
            'fb_page'       => $result['page_name'],
            'fb_subscribed' => $result['subscribed'] ? '1' : '0',
        ]);
    }

    /** POST — called by our own frontend right after landing back on Settings.
     *  No auth:sanctum: the signed pages_token (minted only by callback() above,
     *  valid for 10 minutes) is the credential. */
    public function selectPage(Request $request, FacebookOAuthService $svc): JsonResponse
    {
        $data = $request->validate(['pages_token' => 'required|string', 'page_id' => 'required|string']);

        $payload = $this->decode($data['pages_token']);
        if ($payload === null) {
            return response()->json(['success' => false, 'message' => 'הבחירה פגה, נסה להתחבר שוב'], 400);
        }

        $page = collect($payload['pages'] ?? [])->firstWhere('id', $data['page_id']);
        if (!$page) {
            return response()->json(['success' => false, 'message' => 'העמוד שנבחר לא נמצא, נסה להתחבר שוב'], 404);
        }

        $result = $svc->connectPage($page + ['user_access_token' => $payload['user_access_token'] ?? null], $payload['tenant_id']);
        return response()->json(['success' => true, 'status' => 'connected'] + $result);
    }

    /** Decrypt a state/pages_token value, returning null if invalid or expired. */
    private function decode(string $token): ?array
    {
        try {
            $payload = json_decode(Crypt::decryptString($token), true);
        } catch (DecryptException $e) {
            return null;
        }
        if (!is_array($payload) || ($payload['expires_at'] ?? 0) < now()->timestamp) {
            return null;
        }
        return $payload;
    }

    private function toSettings(array $query): RedirectResponse
    {
        return redirect('/settings?' . http_build_query($query));
    }
}
