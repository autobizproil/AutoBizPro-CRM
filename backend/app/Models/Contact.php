<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Contact extends Model
{
    use HasTenantScope, SoftDeletes;

    protected $fillable = [
        'tenant_id', 'name', 'phone', 'email', 'company', 'tags', 'custom_fields',
    ];

    protected $casts = [
        'tags'          => 'array',
        'custom_fields' => 'array', // Future: migrate to EAV table for advanced querying/filtering
    ];

    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class, 'entity_id')
            ->where('entity_type', 'contact')
            ->latest();
    }
}
