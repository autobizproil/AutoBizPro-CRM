<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('entity_type'); // 'lead' | 'contact'
            $table->unsignedBigInteger('entity_id');
            $table->enum('type', ['call', 'note', 'email', 'meeting', 'task', 'whatsapp', 'payment']);
            $table->text('body')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['entity_type', 'entity_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activities');
    }
};
