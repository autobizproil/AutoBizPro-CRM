<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AutomationLog extends Model
{
    public $timestamps = false;

    protected $fillable = ['automation_id', 'entity_type', 'entity_id', 'status', 'error_message', 'ran_at'];

    protected $casts = ['ran_at' => 'datetime'];

    public function automation(): BelongsTo
    {
        return $this->belongsTo(Automation::class);
    }
}
