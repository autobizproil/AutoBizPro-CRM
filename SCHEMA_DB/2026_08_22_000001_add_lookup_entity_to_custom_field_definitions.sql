-- Migration: 2026-08-22
-- Purpose: let a custom field of type "lookup" point at a target entity
-- (leads/clients/contacts/tasks, or a tenant's custom record type slug),
-- so lookup fields can be created from Settings, not just seeded as
-- system fields (pipeline_stage_id -> stages, assigned_to -> users).
-- Mirrors: database/migrations/2026_08_22_000001_add_lookup_entity_to_custom_field_definitions_table.php

ALTER TABLE `custom_field_definitions` ADD COLUMN IF NOT EXISTS `lookup_entity` VARCHAR(50) DEFAULT NULL AFTER `field_type`;
