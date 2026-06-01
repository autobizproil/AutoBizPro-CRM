<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LandingPage extends Model
{
    use HasTenantScope;

    protected $fillable = [
        'tenant_id',
        'title',
        'slug',
        'blocks',
        'settings',
        'status',
        'views',
    ];

    protected $casts = [
        'blocks'   => 'array',
        'settings' => 'array',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
