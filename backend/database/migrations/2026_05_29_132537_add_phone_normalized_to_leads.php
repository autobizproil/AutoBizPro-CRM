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
            if (!Schema::hasColumn('leads', 'phone_normalized')) {
                $table->string('phone_normalized', 30)->nullable()->index()->after('phone');
            }
        });
    }

    public function down(): void
    {
        Schema::table('leads', fn(Blueprint $t) => $t->dropColumn('phone_normalized'));
    }
};
