<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SavedView extends Model
{
    protected $fillable = [
        'tenant_id', 'user_id', 'entity_type', 'entity_key', 'name',
        'search', 'date_from', 'date_to', 'conditions', 'visible_columns', 'is_default',
    ];

    protected $casts = [
        'conditions'      => 'array',
        'visible_columns' => 'array',
        'is_default'      => 'boolean',
        'date_from'       => 'date:Y-m-d',
        'date_to'         => 'date:Y-m-d',
    ];
}
