<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            if (!Schema::hasColumn('leads', 'fb_leadgen_id')) {
                $table->string('fb_leadgen_id', 64)->nullable()->index()->after('source');
            }
        });
    }

    public function down(): void
    {
        Schema::table('leads', fn(Blueprint $t) => $t->dropColumn('fb_leadgen_id'));
    }
};
