<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Fixes a real filesort found via EXPLAIN on the default lead-list query
// (tenant_id filter + deleted_at IS NULL + ORDER BY created_at DESC) — at
// ~33k rows this was scanning ~16.7k rows per request before sorting.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->index(['tenant_id', 'deleted_at', 'created_at'], 'leads_tenant_deleted_created_index');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex('leads_tenant_deleted_created_index');
        });
    }
};
