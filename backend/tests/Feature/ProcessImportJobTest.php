<?php
namespace Tests\Feature;
use App\Jobs\ProcessImportJob;
use App\Models\ImportJob;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProcessImportJobTest extends TestCase
{
    use RefreshDatabase;

    public function test_processes_full_csv(): void
    {
        $tenant = Tenant::create(['name'=>'T','subdomain'=>'pij','status'=>'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create(['tenant_id'=>$tenant->id,'name'=>'A','email'=>'a@a.co','password'=>Hash::make('x'),'role'=>'admin']);

        $csv = "שם,טלפון\nדני,0501111111\nרון,0502222222\nדני,0501111111\n";
        $path = tempnam(sys_get_temp_dir(), 'csv');
        file_put_contents($path, $csv);

        $job = ImportJob::create([
            'tenant_id'=>$tenant->id,'user_id'=>$user->id,
            'filename'=>'test.csv','storage_path'=>$path,'status'=>'pending',
            'field_mapping'=>['name'=>'שם','phone'=>'טלפון'],
        ]);

        (new ProcessImportJob($job->id))->handle(app(\App\Services\ImportService::class));

        $job->refresh();
        $this->assertSame('done', $job->status);
        $this->assertSame(2, $job->imported);
        $this->assertSame(1, $job->skipped);
        $this->assertSame(2, Lead::count());
    }
}
