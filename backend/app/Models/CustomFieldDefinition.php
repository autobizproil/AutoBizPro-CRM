<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomFieldDefinition extends Model
{
    protected $fillable = [
        'tenant_id', 'entity', 'name', 'label', 'field_type', 'lookup_entity',
        'options', 'option_colors', 'required', 'is_system', 'hidden', 'sort_order',
    ];

    protected $casts = [
        'options'       => 'array',
        'option_colors' => 'array',
        'required'      => 'boolean',
        'is_system'     => 'boolean',
        'hidden'        => 'boolean',
    ];
}
