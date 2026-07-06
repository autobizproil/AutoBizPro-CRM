<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Record extends Model
{
    use HasTenantScope, SoftDeletes;

    protected $fillable = ['tenant_id', 'record_type_id', 'data', 'created_by'];

    protected $casts = ['data' => 'array'];

    public function recordType(): BelongsTo
    {
        return $this->belongsTo(RecordType::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
