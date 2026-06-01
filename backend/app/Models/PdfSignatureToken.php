<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PdfSignatureToken extends Model
{
    use HasTenantScope;

    // Table has only created_at, no updated_at
    public $timestamps = false;

    protected $fillable = [
        'tenant_id',
        'lead_id',
        'token',
        'expires_at',
        'used_at',
        'created_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'used_at'    => 'datetime',
        'created_at' => 'datetime',
    ];

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    /** Is this token still valid (not expired, not used)? */
    public function isValid(): bool
    {
        return $this->used_at === null
            && $this->expires_at->isFuture();
    }
}
