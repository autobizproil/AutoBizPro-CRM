<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ValidationMessageTest extends TestCase
{
    use RefreshDatabase;

    public function test_field_specific_validation_message_is_not_masked_by_generic_string(): void
    {
        $tenant = Tenant::create(['name' => 'Test', 'subdomain' => 'val-msg', 'status' => 'active']);
        $admin  = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Admin',
            'email'     => 'admin@val-msg.test',
            'password'  => bcrypt('password'),
            'role'      => 'admin',
        ]);
        User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Existing',
            'email'     => 'taken@val-msg.test',
            'password'  => bcrypt('password'),
            'role'      => 'agent',
        ]);

        $response = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'val-msg'])
            ->postJson('/api/users', [
                'name'     => 'New User',
                'email'    => 'taken@val-msg.test',
                'password' => 'password123',
                'role'     => 'agent',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'כתובת האימייל כבר קיימת במערכת')
            ->assertJsonPath('errors.email.0', 'כתובת האימייל כבר קיימת במערכת');
    }
}
