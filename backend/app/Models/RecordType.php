<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RecordType extends Model
{
    use HasTenantScope;

    protected $fillable = [
        'tenant_id', 'slug', 'label', 'label_singular', 'icon', 'position',
        'has_payment_lines', 'has_payment_lines_amount_field',
    ];

    protected $casts = ['has_payment_lines' => 'boolean'];

    public function records(): HasMany
    {
        return $this->hasMany(Record::class);
    }
}
