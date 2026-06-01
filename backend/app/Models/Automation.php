<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Automation extends Model
{
    use HasTenantScope;

    protected $fillable = ['tenant_id', 'name', 'trigger_type', 'conditions', 'actions', 'active'];

    protected $casts = [
        'conditions' => 'array',
        'actions'    => 'array',
        'active'     => 'boolean',
    ];

    public function logs(): HasMany
    {
        return $this->hasMany(AutomationLog::class)->latest('ran_at');
    }
}
