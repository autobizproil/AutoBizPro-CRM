-- Migration: 2026-08-18
-- Purpose: Dashboard widgets — one widget's full config (type/entity/filters/etc.)
-- as an opaque JSON blob, belonging to a dashboard_boards row.

CREATE TABLE IF NOT EXISTS `dashboard_widgets` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `board_id` BIGINT UNSIGNED NOT NULL,
    `config` JSON NOT NULL,
    `position` INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    INDEX `dashboard_widgets_board_index` (`tenant_id`, `board_id`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`board_id`) REFERENCES `dashboard_boards`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
