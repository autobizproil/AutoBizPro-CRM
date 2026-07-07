-- Custom Field Definitions table (original version — later rebuilt by 2026_07_05_000001)
-- Mirrors: database/migrations/2026_06_01_000020_create_custom_field_definitions_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.

CREATE TABLE IF NOT EXISTS `custom_field_definitions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(80) NOT NULL,        -- machine key, e.g. "budget", used in custom_fields JSON
    `label` VARCHAR(120) NOT NULL,      -- display label shown to user
    `field_type` VARCHAR(30) NOT NULL,  -- text|number|select|date|checkbox|url|phone|email
    `options` JSON NULL,                -- for select: ["opt1","opt2"]
    `required` TINYINT(1) NOT NULL DEFAULT 0,
    `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY `custom_field_definitions_tenant_id_name_unique` (`tenant_id`, `name`),
    INDEX `custom_field_definitions_tenant_id_sort_order_index` (`tenant_id`, `sort_order`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
