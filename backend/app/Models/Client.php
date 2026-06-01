<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Client extends Model
{
    use HasTenantScope, SoftDeletes;

    protected $fillable = [
        'tenant_id', 'name', 'phone', 'phone_normalized', 'email',
        'company', 'source', 'notes', 'assigned_to', 'source_lead_id', 'custom_fields',
    ];

    protected $casts = [
        'custom_fields' => 'array',
    ];

    protected static function booted(): void
    {
        static::saving(function (Client $client) {
            $client->phone_normalized = \App\Services\PhoneNormalizer::normalize($client->phone);
        });
    }

    public function assignedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function sourceLead(): BelongsTo
    {
        return $this->belongsTo(Lead::class, 'source_lead_id');
    }
}
