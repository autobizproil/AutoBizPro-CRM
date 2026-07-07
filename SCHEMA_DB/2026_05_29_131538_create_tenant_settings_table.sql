-- Tenant Settings table
-- Mirrors: database/migrations/2026_05_29_131538_create_tenant_settings_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.
-- (PHP guard `if (Schema::hasTable(...)) return;` is covered by IF NOT EXISTS.)

CREATE TABLE IF NOT EXISTS `tenant_settings` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `key` VARCHAR(255) NOT NULL,
    `value` JSON NULL,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY `tenant_settings_tenant_id_key_unique` (`tenant_id`, `key`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
