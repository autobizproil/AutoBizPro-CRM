<?php
namespace Tests\Feature;
use App\Models\Client;
use App\Models\Contact;
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

    public function test_import_contact_row_creates_contact(): void
    {
        $this->tenant();
        $svc = app(ImportService::class);
        $mapping = ['name' => 'שם', 'phone' => 'טלפון', 'company' => 'חברה'];
        $result = $svc->importContactRow(['שם'=>'רותי','טלפון'=>'050-2222222','חברה'=>'אקמי'], $mapping);
        $this->assertSame('imported', $result);
        $this->assertDatabaseHas('contacts', ['name'=>'רותי','company'=>'אקמי']);
    }

    public function test_import_contact_row_skips_when_name_missing(): void
    {
        $this->tenant();
        $svc = app(ImportService::class);
        $result = $svc->importContactRow(['טלפון'=>'050-2222222'], ['name' => 'שם', 'phone' => 'טלפון']);
        $this->assertSame('skipped', $result);
        $this->assertSame(0, Contact::count());
    }

    public function test_import_client_row_creates_client(): void
    {
        $this->tenant();
        $svc = app(ImportService::class);
        $mapping = ['name' => 'שם', 'phone' => 'טלפון', 'source' => 'מקור'];
        $result = $svc->importClientRow(['שם'=>'לקוח א','טלפון'=>'050-3333333','מקור'=>'המלצה'], $mapping);
        $this->assertSame('imported', $result);
        $this->assertDatabaseHas('clients', ['name'=>'לקוח א','phone_normalized'=>'0503333333']);
    }

    public function test_import_client_row_duplicate_phone_skipped(): void
    {
        $this->tenant();
        $svc = app(ImportService::class);
        $mapping = ['name' => 'שם', 'phone' => 'טלפון'];
        $svc->importClientRow(['שם'=>'לקוח א','טלפון'=>'050-3333333'], $mapping);
        $result = $svc->importClientRow(['שם'=>'לקוח א שוב','טלפון'=>'0503333333'], $mapping);
        $this->assertSame('skipped', $result);
        $this->assertSame(1, Client::count());
    }
}
