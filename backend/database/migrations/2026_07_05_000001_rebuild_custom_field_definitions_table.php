<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Rebuild: one row per field (system + custom) per entity, fully editable
// (label rename, hide, reorder; system rows cannot be deleted or change type).
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('custom_field_definitions');

        Schema::create('custom_field_definitions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('entity', 30);           // leads | clients | contacts | tasks
            $table->string('name', 80);              // machine key; system: column name, custom: key in custom_fields JSON
            $table->string('label', 120);             // display label (editable, Hebrew)
            $table->string('field_type', 30);         // text|textarea|number|select|date|datetime|checkbox|url|phone|email|lookup
            $table->json('options')->nullable();       // select: ["opt1","opt2"]
            $table->boolean('required')->default(false);
            $table->boolean('is_system')->default(false);
            $table->boolean('hidden')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['tenant_id', 'entity', 'name']);
            $table->index(['tenant_id', 'entity', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('custom_field_definitions');
    }
};
