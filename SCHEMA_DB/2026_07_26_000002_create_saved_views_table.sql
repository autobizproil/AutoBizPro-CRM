-- Migration: 2026-07-26
-- Purpose: Saved Views — per-user named filter/search/column presets per entity

CREATE TABLE IF NOT EXISTS `saved_views` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `entity_type` VARCHAR(20) NOT NULL,
    `entity_key` VARCHAR(64) NULL,
    `name` VARCHAR(120) NOT NULL,
    `search` VARCHAR(255) NULL,
    `date_from` DATE NULL,
    `date_to` DATE NULL,
    `conditions` JSON NULL,
    `visible_columns` JSON NULL,
    `is_default` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    INDEX `saved_views_scope_index` (`tenant_id`, `user_id`, `entity_type`, `entity_key`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
