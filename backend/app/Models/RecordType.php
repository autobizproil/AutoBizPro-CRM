<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RecordType extends Model
{
    use HasTenantScope;

    protected $fillable = ['tenant_id', 'slug', 'label', 'label_singular', 'icon', 'position'];

    public function records(): HasMany
    {
        return $this->hasMany(Record::class);
    }
}
