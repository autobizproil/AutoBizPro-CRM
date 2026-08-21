-- Migration: 2026-08-20
-- Mirrors: database/migrations/2026_08_20_000002_create_record_payment_lines_table.php
-- Purpose: repeating split-payment lines under one invoice-like record (payment
-- type, amount, date) — Sonia's old Fireberry system tracked this as a
-- sub-table per receipt; this CRM's records.data JSON has no child-row concept,
-- so it gets its own real table instead of trying to nest it in JSON.

CREATE TABLE IF NOT EXISTS `record_payment_lines` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `record_id` BIGINT UNSIGNED NOT NULL,
    `payment_type` VARCHAR(50) NOT NULL,
    `amount` DECIMAL(12,2) NOT NULL,
    `paid_at` DATE NULL,
    `position` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    INDEX `record_payment_lines_tenant_id_record_id_index` (`tenant_id`, `record_id`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
