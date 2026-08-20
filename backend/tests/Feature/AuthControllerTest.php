<?php
namespace Tests\Feature;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthControllerTest extends TestCase
{
    use RefreshDatabase;

    // A plain browser navigation to a protected route (no Accept: application/json
    // header) hit Authenticate::redirectTo()'s default route('login') call, which
    // doesn't exist in this API-only app — RouteNotFoundException crashed before
    // AuthenticationException was even constructed, bypassing the JSON exception
    // handler entirely and surfacing as an unhandled 500 in production.
    public function test_unauthenticated_non_xhr_request_gets_json_401_not_a_crash(): void
    {
        $response = $this->get('/api/auth/me', ['Accept' => 'text/html']);

        $response->assertStatus(401);
        $response->assertJson(['success' => false]);
    }
}
