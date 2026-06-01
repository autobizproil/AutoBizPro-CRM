<?php

namespace App\Traits;

use Illuminate\Database\Eloquent\Builder;

trait HasTenantScope
{
    protected static function bootHasTenantScope(): void
    {
        static::addGlobalScope('tenant', function (Builder $query) {
            if (app()->has('current_tenant_id')) {
                $query->where(
                    (new static)->getTable() . '.tenant_id',
                    app('current_tenant_id')
                );
            }
        });

        static::creating(function ($model) {
            if (app()->has('current_tenant_id') && empty($model->tenant_id)) {
                $model->tenant_id = app('current_tenant_id');
            }
        });
    }

    public function scopeWithoutTenant(Builder $query): Builder
    {
        return $query->withoutGlobalScope('tenant');
    }
}
