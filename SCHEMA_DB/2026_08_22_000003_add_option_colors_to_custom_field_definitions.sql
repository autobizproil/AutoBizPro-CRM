-- Migration: 2026-08-22
-- Purpose: per-option colors for select-type custom fields, matching Fireberry's
-- picklist editor (colored dot per value). Kept as a separate optional map rather
-- than restructuring the existing `options` string-array column, so every
-- pre-existing select field (plain string list, no colors) keeps working
-- unchanged — colors are additive, looked up by option name, absent = no color.
-- Mirrors: database/migrations/2026_08_22_000003_add_option_colors_to_custom_field_definitions_table.php

ALTER TABLE `custom_field_definitions` ADD COLUMN IF NOT EXISTS `option_colors` JSON NULL AFTER `options`;
