<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Form extends Model
{
    use HasTenantScope;

    protected $fillable = ['tenant_id', 'name', 'slug', 'fields', 'destination_pipeline_id', 'active'];

    protected $casts = [
        'fields' => 'array',
        'active' => 'boolean',
    ];

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function (Form $form) {
            if (empty($form->slug)) {
                $form->slug = Str::slug($form->name) . '-' . Str::random(6);
            }
        });
    }

    public function destinationStage(): BelongsTo
    {
        return $this->belongsTo(PipelineStage::class, 'destination_pipeline_id');
    }

    public function submissions(): HasMany
    {
        return $this->hasMany(FormSubmission::class);
    }
}
