<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('phone')->nullable();
            $table->string('phone_normalized')->nullable();
            $table->string('email')->nullable();
            $table->string('company')->nullable();
            $table->string('source')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('source_lead_id')->nullable()->constrained('leads')->nullOnDelete();
            $table->json('custom_fields')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['tenant_id', 'created_at']);
            $table->index(['tenant_id', 'phone_normalized']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clients');
    }
};
