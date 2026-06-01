<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Map legacy status values to new action-oriented values
        $map = [
            'new'         => 'NEW_LEAD',
            'contacted'   => 'DISCOVERY_CALL',
            'qualified'   => 'PROPOSAL_SENT',
            'proposal'    => 'PROPOSAL_SENT',
            'closed_won'  => 'WON',
            'closed_lost' => 'LOST',
        ];

        foreach ($map as $old => $new) {
            DB::statement('UPDATE leads SET status = ? WHERE status = ?', [$new, $old]);
        }

        // Any remaining unknown values → NEW_LEAD
        $valid = implode("','", ['NEW_LEAD', 'DISCOVERY_CALL', 'PROPOSAL_SENT', 'CONTRACT_PENDING', 'WON', 'LOST']);
        DB::statement("UPDATE leads SET status = 'NEW_LEAD' WHERE status NOT IN ('{$valid}')");

        // Update column default
        Schema::table('leads', function (Blueprint $table) {
            $table->string('status')->default('NEW_LEAD')->change();
        });
    }

    public function down(): void
    {
        // Reverse: new values back to legacy
        $map = [
            'NEW_LEAD'         => 'new',
            'DISCOVERY_CALL'   => 'contacted',
            'PROPOSAL_SENT'    => 'proposal',
            'CONTRACT_PENDING' => 'proposal',
            'WON'              => 'closed_won',
            'LOST'             => 'closed_lost',
        ];

        foreach ($map as $new => $old) {
            DB::statement('UPDATE leads SET status = ? WHERE status = ?', [$old, $new]);
        }

        Schema::table('leads', function (Blueprint $table) {
            $table->string('status')->default('new')->change();
        });
    }
};
