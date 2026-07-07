-- Add role + notes columns to contacts
-- Mirrors: database/migrations/2026_05_29_094214_add_role_notes_to_contacts_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.

ALTER TABLE `contacts` ADD COLUMN IF NOT EXISTS `role` VARCHAR(255) NULL AFTER `company`;
ALTER TABLE `contacts` ADD COLUMN IF NOT EXISTS `notes` TEXT NULL AFTER `role`;
