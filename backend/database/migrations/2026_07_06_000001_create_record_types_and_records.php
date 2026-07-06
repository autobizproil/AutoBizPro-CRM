<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('record_types')) {
            Schema::create('record_types', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('slug', 64);
                $table->string('label', 120);
                $table->string('label_singular', 120)->nullable();
                $table->string('icon', 16)->nullable();
                $table->unsignedInteger('position')->default(0);
                $table->timestamps();
                $table->unique(['tenant_id', 'slug']);
            });
        }

        if (! Schema::hasTable('records')) {
            Schema::create('records', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('record_type_id')->constrained('record_types')->cascadeOnDelete();
                $table->json('data')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->softDeletes();
                $table->index(['tenant_id', 'record_type_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('records');
        Schema::dropIfExists('record_types');
    }
};
