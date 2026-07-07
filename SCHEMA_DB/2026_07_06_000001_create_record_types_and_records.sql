-- Record Types + Records tables (custom record types)
-- Mirrors: database/migrations/2026_07_06_000001_create_record_types_and_records.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.
-- (PHP guard `if (! Schema::hasTable(...))` is covered by IF NOT EXISTS.)

CREATE TABLE IF NOT EXISTS `record_types` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `label_singular` VARCHAR(120) NULL,
    `icon` VARCHAR(16) NULL,
    `position` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY `record_types_tenant_id_slug_unique` (`tenant_id`, `slug`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `records` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `record_type_id` BIGINT UNSIGNED NOT NULL,
    `data` JSON NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    `deleted_at` TIMESTAMP NULL DEFAULT NULL,
    INDEX `records_tenant_id_record_type_id_index` (`tenant_id`, `record_type_id`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`record_type_id`) REFERENCES `record_types`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
