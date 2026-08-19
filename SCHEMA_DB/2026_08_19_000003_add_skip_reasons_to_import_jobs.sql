-- Migration: 2026-08-19
-- Mirrors: database/migrations/2026_08_19_000003_add_skip_reasons_to_import_jobs.php
-- Purpose: import summary lumped every skip into one "כפילויות" (duplicates)
-- label regardless of actual cause (missing required name field vs. a real
-- duplicate phone number) — misleading users who cleared their data first and
-- still saw "duplicates". Track a per-reason breakdown instead.

ALTER TABLE `import_jobs` ADD COLUMN IF NOT EXISTS `skip_reasons` JSON NULL AFTER `errors`;
