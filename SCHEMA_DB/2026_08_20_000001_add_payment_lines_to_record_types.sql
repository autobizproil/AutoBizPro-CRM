-- Migration: 2026-08-20
-- Mirrors: database/migrations/2026_08_20_000001_add_payment_lines_to_record_types.php
-- Purpose: flag which custom record types are "invoice-like" (show a payment-lines
-- sub-table on the record edit view, usable as a payments:<slug> widget entity),
-- and which of that type's fields holds the invoice total for the soft
-- amount-mismatch warning.

ALTER TABLE `record_types` ADD COLUMN IF NOT EXISTS `has_payment_lines` TINYINT(1) NOT NULL DEFAULT 0 AFTER `position`;
ALTER TABLE `record_types` ADD COLUMN IF NOT EXISTS `has_payment_lines_amount_field` VARCHAR(255) NULL AFTER `has_payment_lines`;
