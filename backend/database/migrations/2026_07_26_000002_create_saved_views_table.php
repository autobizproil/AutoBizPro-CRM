<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('saved_views')) {
            Schema::create('saved_views', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('entity_type', 20);
                $table->string('entity_key', 64)->nullable();
                $table->string('name', 120);
                $table->string('search', 255)->nullable();
                $table->date('date_from')->nullable();
                $table->date('date_to')->nullable();
                $table->json('conditions')->nullable();
                $table->json('visible_columns')->nullable();
                $table->boolean('is_default')->default(false);
                $table->timestamps();
                $table->index(['tenant_id', 'user_id', 'entity_type', 'entity_key'], 'saved_views_scope_index');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('saved_views');
    }
};
