<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Laravel\Socialite\Contracts\User as SocialiteUserContract;
use Laravel\Socialite\Facades\Socialite;
use Mockery;
use Tests\TestCase;

class FacebookOAuthControllerTest extends TestCase
{
    use RefreshDatabase;

    private function tenantAdmin(): array
    {
        $tenant = Tenant::create(['name' => 'Acme', 'subdomain' => 'acme', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create(['tenant_id' => $tenant->id, 'name' => 'Admin', 'email' => 'admin@acme.test', 'password' => bcrypt('x'), 'role' => 'admin']);
        return [$tenant, $user];
    }

    private function fakeSocialiteUser(string $token): SocialiteUserContract
    {
        $socialiteUser = Mockery::mock(SocialiteUserContract::class);
        $socialiteUser->token = $token;
        return $socialiteUser;
    }

    private function stateFor(int $tenantId): string
    {
        return Crypt::encryptString(json_encode(['tenant_id' => $tenantId, 'expires_at' => now()->addMinutes(10)->timestamp]));
    }

    public function test_redirect_sends_the_browser_to_facebook(): void
    {
        [, $user] = $this->tenantAdmin();

        $response = $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->get('/api/integrations/facebook/oauth/redirect');

        $response->assertRedirect();
        $this->assertStringContainsString('facebook.com', $response->headers->get('Location'));
    }

    public function test_callback_with_single_page_redirects_to_settings_connected(): void
    {
        [$tenant] = $this->tenantAdmin();

        Socialite::shouldReceive('driver->stateless->user')->once()->andReturn($this->fakeSocialiteUser('short-lived-token'));
        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response(['access_token' => 'long-lived-token'], 200),
            'graph.facebook.com/*/me/accounts*' => Http::response(['data' => [
                ['id' => '111', 'name' => 'AutoBizPro IL', 'access_token' => 'page-token-111'],
            ]], 200),
            'graph.facebook.com/*/subscribed_apps*' => Http::response(['success' => true], 200),
        ]);

        // No auth, no X-Tenant header, no actingAs — this must work purely from the state param,
        // exactly like Facebook's own redirect would arrive.
        $response = $this->get('/api/integrations/facebook/oauth/callback?state=' . urlencode($this->stateFor($tenant->id)));

        $response->assertRedirect();
        $location = $response->headers->get('Location');
        $this->assertStringContainsString('/settings', $location);
        $this->assertStringContainsString('fb_status=connected', $location);
        $this->assertStringContainsString('fb_subscribed=1', $location);
        $this->assertSame('111', app(SettingsService::class)->get('facebook_page_id'));
    }

    public function test_callback_with_multiple_pages_redirects_with_pages_token_and_no_access_tokens_in_plaintext(): void
    {
        [$tenant] = $this->tenantAdmin();

        Socialite::shouldReceive('driver->stateless->user')->once()->andReturn($this->fakeSocialiteUser('short-lived-token'));
        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response(['access_token' => 'long-lived-token'], 200),
            'graph.facebook.com/*/me/accounts*' => Http::response(['data' => [
                ['id' => '111', 'name' => 'Page One', 'access_token' => 'page-token-111'],
                ['id' => '222', 'name' => 'Page Two', 'access_token' => 'page-token-222'],
            ]], 200),
        ]);

        $response = $this->get('/api/integrations/facebook/oauth/callback?state=' . urlencode($this->stateFor($tenant->id)));

        $response->assertRedirect();
        $location = $response->headers->get('Location');
        $this->assertStringContainsString('fb_status=choose_page', $location);
        $this->assertStringNotContainsString('page-token-111', $location);
        $this->assertStringNotContainsString('page-token-222', $location);
        $this->assertMatchesRegularExpression('/fb_pages_token=[^&]+/', $location);
        $this->assertNull(app(SettingsService::class)->get('facebook_page_id'));
    }

    public function test_callback_with_no_pages_redirects_with_hebrew_error(): void
    {
        [$tenant] = $this->tenantAdmin();

        Socialite::shouldReceive('driver->stateless->user')->once()->andReturn($this->fakeSocialiteUser('short-lived-token'));
        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response(['access_token' => 'long-lived-token'], 200),
            'graph.facebook.com/*/me/accounts*' => Http::response(['data' => []], 200),
        ]);

        $response = $this->get('/api/integrations/facebook/oauth/callback?state=' . urlencode($this->stateFor($tenant->id)));

        $response->assertRedirect();
        $location = urldecode($response->headers->get('Location'));
        $this->assertStringContainsString('fb_status=error', $location);
        $this->assertStringContainsString('לא נמצאו עמודים שאתה מנהל', $location);
    }

    public function test_callback_with_access_denied_redirects_with_cancellation_message(): void
    {
        $response = $this->get('/api/integrations/facebook/oauth/callback?error=access_denied');

        $response->assertRedirect();
        $location = urldecode($response->headers->get('Location'));
        $this->assertStringContainsString('fb_status=error', $location);
        $this->assertStringContainsString('ההתחברות בוטלה', $location);
    }

    public function test_callback_with_invalid_or_missing_state_redirects_with_error(): void
    {
        $response = $this->get('/api/integrations/facebook/oauth/callback?state=not-a-real-encrypted-value');

        $response->assertRedirect();
        $location = urldecode($response->headers->get('Location'));
        $this->assertStringContainsString('fb_status=error', $location);
    }

    public function test_select_page_connects_using_pages_token(): void
    {
        [$tenant] = $this->tenantAdmin();

        Http::fake(['graph.facebook.com/*/subscribed_apps*' => Http::response(['success' => true], 200)]);

        $pagesToken = Crypt::encryptString(json_encode([
            'tenant_id' => $tenant->id,
            'pages' => [
                ['id' => '111', 'name' => 'Page One', 'access_token' => 'page-token-111'],
                ['id' => '222', 'name' => 'Page Two', 'access_token' => 'page-token-222'],
            ],
            'expires_at' => now()->addMinutes(10)->timestamp,
        ]));

        // No auth at all — this must work purely from the pages_token, since it's called by the
        // frontend right after a cross-origin redirect landing, before any session exists.
        $response = $this->postJson('/api/integrations/facebook/oauth/select-page', [
            'pages_token' => $pagesToken,
            'page_id' => '222',
        ]);

        $response->assertOk()->assertJson(['success' => true, 'status' => 'connected', 'page_name' => 'Page Two', 'subscribed' => true]);
        $this->assertSame('222', app(SettingsService::class)->get('facebook_page_id'));
    }

    public function test_select_page_with_expired_pages_token_reports_hebrew_error(): void
    {
        $pagesToken = Crypt::encryptString(json_encode([
            'tenant_id' => 1,
            'pages' => [['id' => '111', 'name' => 'Page One', 'access_token' => 'x']],
            'expires_at' => now()->subMinute()->timestamp,
        ]));

        $this->postJson('/api/integrations/facebook/oauth/select-page', ['pages_token' => $pagesToken, 'page_id' => '111'])
            ->assertStatus(400)
            ->assertJson(['success' => false, 'message' => 'הבחירה פגה, נסה להתחבר שוב']);
    }
}
