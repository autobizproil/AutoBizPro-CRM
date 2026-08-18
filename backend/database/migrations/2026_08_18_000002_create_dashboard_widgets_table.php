<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('dashboard_widgets')) {
            Schema::create('dashboard_widgets', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('board_id')->constrained('dashboard_boards')->cascadeOnDelete();
                $table->json('config');
                $table->unsignedInteger('position')->default(0);
                $table->timestamps();
                $table->index(['tenant_id', 'board_id'], 'dashboard_widgets_board_index');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('dashboard_widgets');
    }
};
