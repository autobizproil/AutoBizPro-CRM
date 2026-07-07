-- Tenants table
-- Mirrors: database/migrations/2024_01_01_000001_create_tenants_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.

CREATE TABLE IF NOT EXISTS `tenants` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `subdomain` VARCHAR(255) NOT NULL UNIQUE,
    `plan` VARCHAR(255) NOT NULL DEFAULT 'basic',
    `status` ENUM('active', 'suspended', 'trial') NOT NULL DEFAULT 'trial',
    `settings` JSON NULL,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
