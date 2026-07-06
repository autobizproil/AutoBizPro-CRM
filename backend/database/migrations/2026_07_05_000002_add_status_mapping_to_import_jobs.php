<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('import_jobs', 'status_mapping')) return;
        Schema::table('import_jobs', function (Blueprint $table) {
            $table->json('status_mapping')->nullable()->after('field_mapping');
        });
    }

    public function down(): void
    {
        Schema::table('import_jobs', function (Blueprint $table) {
            $table->dropColumn('status_mapping');
        });
    }
};
