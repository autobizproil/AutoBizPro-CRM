-- Add is_service flag to users (marks per-tenant automation service users)
-- Mirrors: database/migrations/2026_07_07_000001_add_is_service_to_users_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.
-- (PHP guard `Schema::hasColumn(...)` is covered by IF NOT EXISTS.)

ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `is_service` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`;
