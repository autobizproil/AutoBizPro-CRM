-- Add fb_leadgen_id column to leads
-- Mirrors: database/migrations/2026_08_10_000001_add_fb_leadgen_id_to_leads.php
-- Purpose: dedupe/track Facebook Lead Ads webhook deliveries by leadgen_id
-- instead of relying only on normalized phone. Facebook retries webhook
-- delivery on non-200 responses, so leadgen_id is the reliable dedupe key.

ALTER TABLE `leads` ADD COLUMN IF NOT EXISTS `fb_leadgen_id` VARCHAR(64) NULL AFTER `source`;
CREATE INDEX IF NOT EXISTS `leads_fb_leadgen_id_index` ON `leads` (`fb_leadgen_id`);
