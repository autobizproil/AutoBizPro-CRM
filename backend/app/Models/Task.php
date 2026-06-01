<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Task extends Model
{
    use HasTenantScope, SoftDeletes;

    protected $fillable = [
        'tenant_id', 'title', 'description', 'priority', 'status',
        'due_at', 'assigned_to', 'created_by', 'related_type', 'related_id', 'completed_at',
    ];

    protected $casts = [
        'due_at'       => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function assignedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scopeOpen($q)      { return $q->where('status', 'open'); }
    public function scopeOverdue($q)   { return $q->where('status', 'open')->whereNotNull('due_at')->where('due_at', '<', now()); }
}
