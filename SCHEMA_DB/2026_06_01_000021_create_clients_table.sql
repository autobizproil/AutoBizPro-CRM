-- Clients table
-- Mirrors: database/migrations/2026_06_01_000021_create_clients_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.

CREATE TABLE IF NOT EXISTS `clients` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(255) NULL,
    `phone_normalized` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `company` VARCHAR(255) NULL,
    `source` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `assigned_to` BIGINT UNSIGNED NULL,
    `source_lead_id` BIGINT UNSIGNED NULL,
    `custom_fields` JSON NULL,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    `deleted_at` TIMESTAMP NULL DEFAULT NULL,
    INDEX `clients_tenant_id_created_at_index` (`tenant_id`, `created_at`),
    INDEX `clients_tenant_id_phone_normalized_index` (`tenant_id`, `phone_normalized`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`source_lead_id`) REFERENCES `leads`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
