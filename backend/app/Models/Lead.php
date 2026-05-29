<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Lead extends Model
{
    use HasTenantScope, SoftDeletes;

    protected $fillable = [
        'tenant_id', 'name', 'phone', 'phone_normalized', 'email', 'status',
        'pipeline_stage_id', 'assigned_to', 'source', 'notes', 'custom_fields',
    ];

    protected $casts = [
        'custom_fields' => 'array', // Future: migrate to EAV table for advanced querying/filtering
    ];

    protected static function booted(): void
    {
        static::saving(function (Lead $lead) {
            $lead->phone_normalized = \App\Services\PhoneNormalizer::normalize($lead->phone);
        });
    }

    public function stage(): BelongsTo
    {
        return $this->belongsTo(PipelineStage::class, 'pipeline_stage_id');
    }

    public function assignedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class, 'entity_id')
            ->where('entity_type', 'lead')
            ->latest();
    }

    public function scopeOwnedBy($query, int $userId)
    {
        return $query->where('assigned_to', $userId);
    }
}
