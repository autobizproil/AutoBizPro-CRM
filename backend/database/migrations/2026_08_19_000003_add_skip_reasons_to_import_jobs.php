<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('import_jobs', function (Blueprint $table) {
            if (!Schema::hasColumn('import_jobs', 'skip_reasons')) {
                $table->json('skip_reasons')->nullable()->after('errors');
            }
        });
    }

    public function down(): void
    {
        Schema::table('import_jobs', fn (Blueprint $t) => $t->dropColumn('skip_reasons'));
    }
};
