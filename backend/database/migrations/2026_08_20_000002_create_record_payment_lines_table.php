<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('record_payment_lines')) {
            Schema::create('record_payment_lines', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('record_id')->constrained('records')->cascadeOnDelete();
                $table->string('payment_type', 50);
                $table->decimal('amount', 12, 2);
                $table->date('paid_at')->nullable();
                $table->unsignedInteger('position')->default(0);
                $table->timestamps();
                $table->index(['tenant_id', 'record_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('record_payment_lines');
    }
};
