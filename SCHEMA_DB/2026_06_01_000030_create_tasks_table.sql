-- Tasks table
-- Mirrors: database/migrations/2026_06_01_000030_create_tasks_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.

CREATE TABLE IF NOT EXISTS `tasks` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `priority` VARCHAR(20) NOT NULL DEFAULT 'medium', -- low | medium | high
    `status` VARCHAR(20) NOT NULL DEFAULT 'open',     -- open | done
    `due_at` DATETIME NULL,
    `assigned_to` BIGINT UNSIGNED NULL,
    `created_by` BIGINT UNSIGNED NULL,
    -- Polymorphic link to a lead/client/contact (optional)
    `related_type` VARCHAR(30) NULL, -- lead | client | contact
    `related_id` BIGINT UNSIGNED NULL,
    `completed_at` DATETIME NULL,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    `deleted_at` TIMESTAMP NULL DEFAULT NULL,
    INDEX `tasks_tenant_id_status_due_at_index` (`tenant_id`, `status`, `due_at`),
    INDEX `tasks_tenant_id_assigned_to_index` (`tenant_id`, `assigned_to`),
    INDEX `tasks_related_type_related_id_index` (`related_type`, `related_id`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
