<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    public function test_redirect_sends_the_browser_to_facebook(): void
    {
        [, $user] = $this->tenantAdmin();

        $response = $this->withHeader('X-Tenant', 'acme')
            ->withHeader('referer', 'http://localhost')
            ->actingAs($user)
            ->get('/api/integrations/facebook/oauth/redirect');

        $response->assertRedirect();
        $this->assertStringContainsString('facebook.com', $response->headers->get('Location'));
    }

    public function test_callback_with_single_page_connects_immediately(): void
    {
        [$tenant, $user] = $this->tenantAdmin();

        Socialite::shouldReceive('driver->user')->once()->andReturn($this->fakeSocialiteUser('short-lived-token'));
        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response(['access_token' => 'long-lived-token'], 200),
            'graph.facebook.com/*/me/accounts*' => Http::response(['data' => [
                ['id' => '111', 'name' => 'AutoBizPro IL', 'access_token' => 'page-token-111'],
            ]], 200),
            'graph.facebook.com/*/subscribed_apps*' => Http::response(['success' => true], 200),
        ]);

        $response = $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->getJson('/api/integrations/facebook/oauth/callback');

        $response->assertOk()->assertJson(['success' => true, 'status' => 'connected', 'page_name' => 'AutoBizPro IL', 'subscribed' => true]);
        $this->assertSame('111', app(SettingsService::class)->get('facebook_page_id'));
    }

    public function test_callback_with_multiple_pages_returns_choices_without_tokens(): void
    {
        [, $user] = $this->tenantAdmin();

        Socialite::shouldReceive('driver->user')->once()->andReturn($this->fakeSocialiteUser('short-lived-token'));
        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response(['access_token' => 'long-lived-token'], 200),
            'graph.facebook.com/*/me/accounts*' => Http::response(['data' => [
                ['id' => '111', 'name' => 'Page One', 'access_token' => 'page-token-111'],
                ['id' => '222', 'name' => 'Page Two', 'access_token' => 'page-token-222'],
            ]], 200),
        ]);

        $response = $this->withHeader('X-Tenant', 'acme')
            ->withHeader('referer', 'http://localhost')
            ->actingAs($user)
            ->getJson('/api/integrations/facebook/oauth/callback');

        $response->assertOk()->assertJson(['success' => true, 'status' => 'choose_page']);
        $response->assertJsonPath('pages.0.id', '111');
        $response->assertJsonPath('pages.0.name', 'Page One');
        $response->assertJsonMissingPath('pages.0.access_token');
        $this->assertNull(app(SettingsService::class)->get('facebook_page_id'));
    }

    public function test_callback_with_no_pages_reports_hebrew_error(): void
    {
        [, $user] = $this->tenantAdmin();

        Socialite::shouldReceive('driver->user')->once()->andReturn($this->fakeSocialiteUser('short-lived-token'));
        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response(['access_token' => 'long-lived-token'], 200),
            'graph.facebook.com/*/me/accounts*' => Http::response(['data' => []], 200),
        ]);

        $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->getJson('/api/integrations/facebook/oauth/callback')
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'לא נמצאו עמודים שאתה מנהל']);
    }

    public function test_callback_with_access_denied_reports_cancellation(): void
    {
        [, $user] = $this->tenantAdmin();

        $this->withHeader('X-Tenant', 'acme')
            ->actingAs($user)
            ->getJson('/api/integrations/facebook/oauth/callback?error=access_denied')
            ->assertOk()
            ->assertJson(['success' => false, 'message' => 'ההתחברות בוטלה']);
    }

    public function test_select_page_connects_from_stashed_session_choices(): void
    {
        [, $user] = $this->tenantAdmin();

        Http::fake(['graph.facebook.com/*/subscribed_apps*' => Http::response(['success' => true], 200)]);

        session(['facebook_oauth_pages' => [
            ['id' => '111', 'name' => 'Page One', 'access_token' => 'page-token-111'],
            ['id' => '222', 'name' => 'Page Two', 'access_token' => 'page-token-222'],
        ]]);

        $response = $this->withHeader('X-Tenant', 'acme')
            ->withHeader('referer', 'http://localhost')
            ->actingAs($user)
            ->postJson('/api/integrations/facebook/oauth/select-page', ['page_id' => '222']);

        $response->assertOk()->assertJson(['success' => true, 'status' => 'connected', 'page_name' => 'Page Two', 'subscribed' => true]);
        $this->assertSame('222', app(SettingsService::class)->get('facebook_page_id'));
    }
}
