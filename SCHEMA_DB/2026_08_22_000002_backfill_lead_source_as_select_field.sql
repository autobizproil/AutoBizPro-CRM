-- Migration: 2026-08-22
-- Purpose: data backfill, not a schema change — no ALTER TABLE needed.
-- Documented here anyway for traceability alongside the Laravel migration:
-- flips already-seeded מקור הגעה (leads.source) system field rows from
-- field_type "text" to "select" with the same default option list, so the
-- existing generic select-field options editor in הגדרות רשומות can manage
-- it (previously hardcoded in frontend/src/lib/leadSources.js, not
-- DB-backed or tenant-editable at all).
-- Mirrors: backend/database/migrations/2026_08_22_000002_backfill_lead_source_as_select_field.php

UPDATE `custom_field_definitions`
SET `field_type` = 'select',
    `options` = '["וואטסאפ","פייסבוק","קשר אישי","טלפון","חבר מביא חבר","דיוור ישיר","אינסטגרם","אינטרנט","אחר"]'
WHERE `entity` = 'leads' AND `name` = 'source' AND `is_system` = 1 AND `field_type` = 'text';
