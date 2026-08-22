<?php

use App\Models\CustomFieldDefinition;
use Illuminate\Database\Migrations\Migration;

// Data backfill, not a schema change: the מקור הגעה system field was seeded as a
// plain "text" field for every tenant created before this session — its dropdown
// list actually lived hardcoded in frontend/src/lib/leadSources.js, not editable
// by the tenant at all. Flips already-seeded rows to "select" with that same list
// as real DB-backed options, so it becomes user-editable like any other picklist.
return new class extends Migration
{
    public function up(): void
    {
        $defaults = ['וואטסאפ', 'פייסבוק', 'קשר אישי', 'טלפון', 'חבר מביא חבר', 'דיוור ישיר', 'אינסטגרם', 'אינטרנט', 'אחר'];

        CustomFieldDefinition::where('entity', 'leads')
            ->where('name', 'source')
            ->where('is_system', true)
            ->where('field_type', 'text')
            ->get()
            ->each(fn ($field) => $field->update(['field_type' => 'select', 'options' => $defaults]));
    }

    public function down(): void
    {
        CustomFieldDefinition::where('entity', 'leads')
            ->where('name', 'source')
            ->where('is_system', true)
            ->where('field_type', 'select')
            ->update(['field_type' => 'text', 'options' => null]);
    }
};
