<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pdf_signature_tokens', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->unsignedBigInteger('lead_id')->index();
            $table->string('token', 64)->unique();
            $table->timestamp('expires_at');
            $table->timestamp('used_at')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('tenant_id')->references('id')->on('tenants')->cascadeOnDelete();
            $table->foreign('lead_id')->references('id')->on('leads')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pdf_signature_tokens');
    }
};
