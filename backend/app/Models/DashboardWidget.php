<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DashboardWidget extends Model
{
    use HasTenantScope;

    protected $fillable = ['tenant_id', 'board_id', 'config', 'position'];

    protected $casts = ['config' => 'array'];

    public function board(): BelongsTo
    {
        return $this->belongsTo(DashboardBoard::class, 'board_id');
    }
}
