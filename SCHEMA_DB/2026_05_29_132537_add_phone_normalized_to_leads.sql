-- Add phone_normalized column to leads
-- Mirrors: database/migrations/2026_05_29_132537_add_phone_normalized_to_leads.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.
-- (PHP guard `Schema::hasColumn(...)` is covered by IF NOT EXISTS.)

ALTER TABLE `leads` ADD COLUMN IF NOT EXISTS `phone_normalized` VARCHAR(30) NULL AFTER `phone`;
CREATE INDEX IF NOT EXISTS `leads_phone_normalized_index` ON `leads` (`phone_normalized`);
