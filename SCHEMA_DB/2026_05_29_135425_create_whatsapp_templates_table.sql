-- WhatsApp Templates table
-- Mirrors: database/migrations/2026_05_29_135425_create_whatsapp_templates_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.
-- (PHP guard `if (Schema::hasTable(...)) return;` is covered by IF NOT EXISTS.)

CREATE TABLE IF NOT EXISTS `whatsapp_templates` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `body` TEXT NOT NULL, -- supports {name} placeholders
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
