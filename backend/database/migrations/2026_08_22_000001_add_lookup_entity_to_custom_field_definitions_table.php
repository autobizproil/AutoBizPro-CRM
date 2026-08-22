<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('custom_field_definitions', 'lookup_entity')) {
            Schema::table('custom_field_definitions', function (Blueprint $table) {
                $table->string('lookup_entity', 50)->nullable()->after('field_type');
            });
        }
    }

    public function down(): void
    {
        Schema::table('custom_field_definitions', function (Blueprint $table) {
            $table->dropColumn('lookup_entity');
        });
    }
};
