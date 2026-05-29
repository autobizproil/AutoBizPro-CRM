<?php
namespace Tests\Feature;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ImportControllerTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $sub = 'imp-ctl'): array
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => $sub, 'status' => 'active']);
        $user = User::create([
            'tenant_id' => $tenant->id, 'name' => 'Admin',
            'email' => "a@$sub.co", 'password' => Hash::make('x'), 'role' => 'admin',
        ]);
        return [$tenant, $user, $sub];
    }

    public function test_full_import_flow_upload_then_start(): void
    {
        [$tenant, $admin, $sub] = $this->admin();

        $csv = "שם,טלפון,מקור\nדני,050-1111111,אתר\nרון,0502222222,פייסבוק\nדני,0501111111,אתר\n";
        $file = UploadedFile::fake()->createWithContent('leads.csv', $csv);

        // 1. upload
        $up = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => $sub])
            ->post('/api/import/upload', ['file' => $file]);

        $up->assertOk();
        $up->assertJsonPath('data.headers', ['שם', 'טלפון', 'מקור']);
        $importId = $up->json('data.import_id');
        $this->assertNotNull($importId);

        // 2. start (queue runs sync in tests)
        $start = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => $sub])
            ->postJson('/api/import/start', [
                'import_id'     => $importId,
                'field_mapping' => ['name' => 'שם', 'phone' => 'טלפון', 'source' => 'מקור'],
            ]);

        $start->assertCreated();

        // 3. verify — 2 imported, 1 skipped (dup phone)
        app()->instance('current_tenant_id', $tenant->id);
        $this->assertSame(2, Lead::count());
        $this->assertDatabaseHas('leads', ['name' => 'דני', 'phone_normalized' => '0501111111']);
        $this->assertDatabaseHas('leads', ['name' => 'רון', 'source' => 'פייסבוק']);
    }

    public function test_start_rejects_other_tenants_import_job(): void
    {
        Storage::fake('local');
        [$tenantA, $adminA, $subA] = $this->admin('tenant-a');

        $csv = "שם,טלפון\nדני,0501111111\n";
        $file = UploadedFile::fake()->createWithContent('a.csv', $csv);
        $up = $this->actingAs($adminA)->withHeaders(['X-Tenant' => $subA])
            ->post('/api/import/upload', ['file' => $file]);
        $importId = $up->json('data.import_id');

        // Tenant B tries to start tenant A's import job
        [$tenantB, $adminB, $subB] = $this->admin('tenant-b');
        $resp = $this->actingAs($adminB)->withHeaders(['X-Tenant' => $subB])
            ->postJson('/api/import/start', [
                'import_id'     => $importId,
                'field_mapping' => ['name' => 'שם'],
            ]);

        $resp->assertNotFound(); // scoped query → 404, cannot touch another tenant's job
    }
}
