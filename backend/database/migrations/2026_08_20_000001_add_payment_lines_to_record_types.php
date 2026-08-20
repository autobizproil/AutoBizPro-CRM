<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('record_types', function (Blueprint $table) {
            if (! Schema::hasColumn('record_types', 'has_payment_lines')) {
                $table->boolean('has_payment_lines')->default(false)->after('position');
            }
            if (! Schema::hasColumn('record_types', 'has_payment_lines_amount_field')) {
                $table->string('has_payment_lines_amount_field')->nullable()->after('has_payment_lines');
            }
        });
    }

    public function down(): void
    {
        Schema::table('record_types', function (Blueprint $table) {
            $table->dropColumn(['has_payment_lines', 'has_payment_lines_amount_field']);
        });
    }
};
