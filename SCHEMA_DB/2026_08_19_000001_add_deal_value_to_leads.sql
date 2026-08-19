-- Add deal_value column to leads
-- Mirrors: database/migrations/2026_08_19_000001_add_deal_value_to_leads.php
-- Purpose: first real numeric field on any widget-builder entity — lights up
-- the sum/avg/max/min aggregation UI in the dashboard widget builder, which
-- was disabled until now since no entity exposed a real monetary column.

ALTER TABLE `leads` ADD COLUMN IF NOT EXISTS `deal_value` DECIMAL(12,2) NULL AFTER `source`;
