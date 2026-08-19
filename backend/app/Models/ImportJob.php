<?php
namespace App\Models;
use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;

class ImportJob extends Model
{
    use HasTenantScope;
    protected $fillable = [
        'tenant_id','user_id','entity','record_type_id','filename','storage_path','status',
        'total_rows','imported','skipped','field_mapping','status_mapping','errors','skip_reasons',
    ];
    protected $casts = ['field_mapping' => 'array', 'status_mapping' => 'array', 'errors' => 'array', 'skip_reasons' => 'array'];
}
