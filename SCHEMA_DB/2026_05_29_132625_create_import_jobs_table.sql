-- Import Jobs table
-- Mirrors: database/migrations/2026_05_29_132625_create_import_jobs_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.
-- (PHP guard `if (Schema::hasTable(...)) return;` is covered by IF NOT EXISTS.)

CREATE TABLE IF NOT EXISTS `import_jobs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `filename` VARCHAR(255) NOT NULL,
    `storage_path` VARCHAR(255) NOT NULL,
    `status` VARCHAR(255) NOT NULL DEFAULT 'pending', -- pending|processing|done|failed
    `total_rows` INT UNSIGNED NOT NULL DEFAULT 0,
    `imported` INT UNSIGNED NOT NULL DEFAULT 0,
    `skipped` INT UNSIGNED NOT NULL DEFAULT 0,
    `field_mapping` JSON NULL,
    `errors` JSON NULL,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
