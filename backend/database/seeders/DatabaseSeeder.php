<?php

namespace Database\Seeders;

use App\Models\PipelineStage;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Demo tenant — matches X-Tenant 'demo' sent by the SPA on localhost
        $tenant = Tenant::firstOrCreate(
            ['subdomain' => 'demo'],
            ['name' => 'דמו דלתות', 'plan' => 'pro', 'status' => 'active']
        );

        app()->instance('current_tenant_id', $tenant->id);

        // Admin login: admin@demo.com / password
        User::firstOrCreate(
            ['email' => 'admin@demo.com'],
            [
                'tenant_id' => $tenant->id,
                'name'      => 'מנהל ראשי',
                'password'  => Hash::make('password'),
                'role'      => 'admin',
                'status'    => 'active',
            ]
        );

        // Default pipeline stages for the simple 4-step door-sales flow
        $stages = [
            ['name' => 'ליד חדש',    'color' => '#6366f1', 'position' => 1],
            ['name' => 'שיחת טלפון', 'color' => '#0ea5e9', 'position' => 2],
            ['name' => 'הצעת מחיר',  'color' => '#f59e0b', 'position' => 3],
            ['name' => 'נסגר',       'color' => '#22c55e', 'position' => 4],
        ];
        foreach ($stages as $s) {
            PipelineStage::firstOrCreate(
                ['tenant_id' => $tenant->id, 'name' => $s['name']],
                ['color' => $s['color'], 'position' => $s['position']]
            );
        }
    }
}
