<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('custom_field_definitions', 'option_colors')) {
            Schema::table('custom_field_definitions', function (Blueprint $table) {
                $table->json('option_colors')->nullable()->after('options');
            });
        }
    }

    public function down(): void
    {
        Schema::table('custom_field_definitions', function (Blueprint $table) {
            $table->dropColumn('option_colors');
        });
    }
};
