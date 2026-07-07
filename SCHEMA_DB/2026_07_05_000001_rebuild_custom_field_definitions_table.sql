-- Rebuild Custom Field Definitions table: one row per field (system + custom) per entity,
-- fully editable (label rename, hide, reorder; system rows cannot be deleted or change type).
-- Mirrors: database/migrations/2026_07_05_000001_rebuild_custom_field_definitions_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.

DROP TABLE IF EXISTS `custom_field_definitions`;

CREATE TABLE IF NOT EXISTS `custom_field_definitions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `entity` VARCHAR(30) NOT NULL,      -- leads | clients | contacts | tasks
    `name` VARCHAR(80) NOT NULL,        -- machine key; system: column name, custom: key in custom_fields JSON
    `label` VARCHAR(120) NOT NULL,      -- display label (editable, Hebrew)
    `field_type` VARCHAR(30) NOT NULL,  -- text|textarea|number|select|date|datetime|checkbox|url|phone|email|lookup
    `options` JSON NULL,                -- select: ["opt1","opt2"]
    `required` TINYINT(1) NOT NULL DEFAULT 0,
    `is_system` TINYINT(1) NOT NULL DEFAULT 0,
    `hidden` TINYINT(1) NOT NULL DEFAULT 0,
    `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY `custom_field_definitions_tenant_id_entity_name_unique` (`tenant_id`, `entity`, `name`),
    INDEX `custom_field_definitions_tenant_id_entity_sort_order_index` (`tenant_id`, `entity`, `sort_order`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
