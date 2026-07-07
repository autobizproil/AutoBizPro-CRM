-- Activities table
-- Mirrors: database/migrations/2024_01_01_000006_create_activities_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.

CREATE TABLE IF NOT EXISTS `activities` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `entity_type` VARCHAR(255) NOT NULL, -- 'lead' | 'contact'
    `entity_id` BIGINT UNSIGNED NOT NULL,
    `type` ENUM('call', 'note', 'email', 'meeting', 'task', 'whatsapp', 'payment') NOT NULL,
    `body` TEXT NULL,
    `user_id` BIGINT UNSIGNED NULL,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    INDEX `activities_entity_type_entity_id_index` (`entity_type`, `entity_id`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
