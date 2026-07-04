<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomFieldDefinition extends Model
{
    protected $fillable = [
        'tenant_id', 'entity', 'name', 'label', 'field_type',
        'options', 'required', 'is_system', 'hidden', 'sort_order',
    ];

    protected $casts = [
        'options'   => 'array',
        'required'  => 'boolean',
        'is_system' => 'boolean',
        'hidden'    => 'boolean',
    ];
}
