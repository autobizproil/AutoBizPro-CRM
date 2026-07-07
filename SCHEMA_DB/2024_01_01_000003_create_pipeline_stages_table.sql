-- Pipeline Stages table
-- Mirrors: database/migrations/2024_01_01_000003_create_pipeline_stages_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.

CREATE TABLE IF NOT EXISTS `pipeline_stages` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `color` VARCHAR(255) NOT NULL DEFAULT '#6366f1',
    `position` INT UNSIGNED NOT NULL DEFAULT 0, -- 'position' not 'order' — reserved word in MySQL
    `type` ENUM('lead', 'sales', 'custom') NOT NULL DEFAULT 'lead',
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
