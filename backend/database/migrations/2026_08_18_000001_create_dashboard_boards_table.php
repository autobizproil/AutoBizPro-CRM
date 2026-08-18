<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('dashboard_boards')) {
            Schema::create('dashboard_boards', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('name', 120);
                $table->unsignedInteger('position')->default(0);
                $table->timestamps();
                $table->index(['tenant_id', 'user_id'], 'dashboard_boards_owner_index');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('dashboard_boards');
    }
};
