<?php
namespace Tests\Feature;
use App\Models\Lead;
use App\Models\Tenant;
use App\Services\ImportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ImportServiceTest extends TestCase
{
    use RefreshDatabase;

    private function tenant(): Tenant
    {
        $t = Tenant::create(['name'=>'T','subdomain'=>'imp','status'=>'active']);
        app()->instance('current_tenant_id', $t->id);
        return $t;
    }

    public function test_reads_csv_headers(): void
    {
        $csv = "שם,טלפון,מקור\nדני,050-1111111,אתר\n";
        $path = tempnam(sys_get_temp_dir(), 'csv');
        file_put_contents($path, $csv);
        $svc = app(ImportService::class);
        $this->assertSame(['שם','טלפון','מקור'], $svc->headers($path));
    }

    public function test_import_row_creates_lead(): void
    {
        $this->tenant();
        $svc = app(ImportService::class);
        $mapping = ['name' => 'שם', 'phone' => 'טלפון', 'source' => 'מקור'];
        $result = $svc->importRow(['שם'=>'דני','טלפון'=>'050-1111111','מקור'=>'אתר'], $mapping);
        $this->assertSame('imported', $result);
        $this->assertDatabaseHas('leads', ['name'=>'דני','phone_normalized'=>'0501111111']);
    }

    public function test_duplicate_phone_skipped(): void
    {
        $this->tenant();
        $svc = app(ImportService::class);
        $mapping = ['name' => 'שם', 'phone' => 'טלפון'];
        $svc->importRow(['שם'=>'דני','טלפון'=>'050-1111111'], $mapping);
        $result = $svc->importRow(['שם'=>'דני שוב','טלפון'=>'0501111111'], $mapping);
        $this->assertSame('skipped', $result);
        $this->assertSame(1, Lead::count());
    }
}
