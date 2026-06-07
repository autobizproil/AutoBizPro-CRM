<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Covers the authentication entry points (login / logout / me) that were
 * previously untested. Auth is the front door of the app, so both the happy
 * paths and the rejection contracts (401 / 422) are asserted explicitly.
 */
class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    private function makeTenantUser(string $subdomain, string $role = 'admin', string $password = 'secret123'): array
    {
        $tenant = Tenant::create([
            'name'      => "Tenant $subdomain",
            'subdomain' => $subdomain,
            'status'    => 'active',
        ]);

        $user = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Test User',
            'email'     => "user@$subdomain.test",
            'password'  => bcrypt($password),
            'role'      => $role,
        ]);

        return [$tenant, $user];
    }

    public function test_login_with_valid_credentials_returns_user_and_permissions(): void
    {
        [$tenant, $user] = $this->makeTenantUser('login-ok');

        $response = $this->postJson('/api/auth/login', [
            'email'    => $user->email,
            'password' => 'secret123',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.email', $user->email);

        // Admin should be granted every permission module/action.
        $response->assertJsonPath('data.permissions.leads.can_read', true)
            ->assertJsonPath('data.permissions.users.can_delete', true);
    }

    public function test_login_with_wrong_password_is_rejected(): void
    {
        [, $user] = $this->makeTenantUser('login-badpass');

        $response = $this->postJson('/api/auth/login', [
            'email'    => $user->email,
            'password' => 'not-the-password',
        ]);

        $response->assertStatus(401)
            ->assertJsonPath('success', false);
    }

    public function test_login_with_unknown_email_is_rejected(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'email'    => 'nobody@example.test',
            'password' => 'whatever123',
        ]);

        $response->assertStatus(401)
            ->assertJsonPath('success', false);
    }

    public function test_login_requires_a_valid_email(): void
    {
        $this->postJson('/api/auth/login', ['password' => 'secret123'])
            ->assertStatus(422);

        $this->postJson('/api/auth/login', [
            'email'    => 'not-an-email',
            'password' => 'secret123',
        ])->assertStatus(422);
    }

    public function test_login_requires_a_password(): void
    {
        $this->postJson('/api/auth/login', ['email' => 'user@example.test'])
            ->assertStatus(422);
    }

    public function test_permissions_payload_reflects_limited_role(): void
    {
        [, $agent] = $this->makeTenantUser('login-agent', 'agent');

        $response = $this->postJson('/api/auth/login', [
            'email'    => $agent->email,
            'password' => 'secret123',
        ]);

        // Agents may read/create leads & contacts, but not delete or touch users.
        $response->assertOk()
            ->assertJsonPath('data.permissions.leads.can_read', true)
            ->assertJsonPath('data.permissions.leads.can_delete', false)
            ->assertJsonPath('data.permissions.users.can_read', false);
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_me_returns_the_authenticated_user(): void
    {
        [, $user] = $this->makeTenantUser('me-ok');

        $response = $this->actingAs($user)
            ->withHeaders(['X-Tenant' => 'me-ok'])
            ->getJson('/api/auth/me');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.id', $user->id)
            ->assertJsonPath('data.user.email', $user->email);
    }

    public function test_logout_succeeds_for_authenticated_user(): void
    {
        [, $user] = $this->makeTenantUser('logout-ok');

        // Logout relies on the SPA session (Sanctum cookie mode); a Referer from
        // a stateful domain makes the request go through the session middleware.
        $response = $this->actingAs($user)
            ->withSession([])
            ->withHeaders([
                'X-Tenant' => 'logout-ok',
                'Referer'  => 'http://localhost',
            ])
            ->postJson('/api/auth/logout');

        $response->assertOk()
            ->assertJsonPath('success', true);
    }
}
