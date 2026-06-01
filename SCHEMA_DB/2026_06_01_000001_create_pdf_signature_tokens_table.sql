-- PDF Signature Tokens table
-- Mirrors: database/migrations/2026_06_01_000001_create_pdf_signature_tokens_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.

CREATE TABLE IF NOT EXISTS `pdf_signature_tokens` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `lead_id` BIGINT UNSIGNED NOT NULL,
    `token` VARCHAR(64) NOT NULL UNIQUE,
    `expires_at` TIMESTAMP NOT NULL,
    `used_at` TIMESTAMP NULL DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `pdf_signature_tokens_tenant_id_index` (`tenant_id`),
    INDEX `pdf_signature_tokens_lead_id_index` (`lead_id`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Example ALTER TABLE with IF NOT EXISTS (per CLAUDE.md rule):
-- ALTER TABLE `pdf_signature_tokens` ADD COLUMN IF NOT EXISTS `used_at` TIMESTAMP NULL DEFAULT NULL;
