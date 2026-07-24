<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Generalize CSV import beyond leads: 'entity' is 'leads' or a record_type
// slug; record_type_id caches the resolved id to avoid a slug lookup per row.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('import_jobs', function (Blueprint $table) {
            $table->string('entity', 64)->default('leads')->after('user_id');
            $table->foreignId('record_type_id')->nullable()->after('entity')
                ->constrained('record_types')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('import_jobs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('record_type_id');
            $table->dropColumn('entity');
        });
    }
};
