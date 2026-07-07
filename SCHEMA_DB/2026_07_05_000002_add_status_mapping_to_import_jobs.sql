-- Add status_mapping column to import_jobs
-- Mirrors: database/migrations/2026_07_05_000002_add_status_mapping_to_import_jobs.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.
-- (PHP guard `Schema::hasColumn(...)` is covered by IF NOT EXISTS.)

ALTER TABLE `import_jobs` ADD COLUMN IF NOT EXISTS `status_mapping` JSON NULL AFTER `field_mapping`;
