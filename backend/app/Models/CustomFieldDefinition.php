<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomFieldDefinition extends Model
{
    protected $fillable = ['tenant_id', 'name', 'label', 'field_type', 'options', 'required', 'sort_order'];

    protected $casts = [
        'options'  => 'array',
        'required' => 'boolean',
    ];
}
