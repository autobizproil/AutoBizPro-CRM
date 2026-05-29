<?php
namespace App\Models;
use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;

class TenantSetting extends Model
{
    use HasTenantScope;
    protected $fillable = ['tenant_id', 'key', 'value'];
    protected $casts = ['value' => 'array'];
}
