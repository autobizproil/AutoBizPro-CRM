-- Roles Permissions table
-- Mirrors: database/migrations/2024_01_01_000009_create_roles_permissions_table.php
-- All ADD COLUMN statements use IF NOT EXISTS per project rules.

CREATE TABLE IF NOT EXISTS `roles_permissions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT UNSIGNED NOT NULL,
    `role` ENUM('super_admin', 'admin', 'manager', 'agent') NOT NULL,
    `module` VARCHAR(255) NOT NULL,
    `can_create` TINYINT(1) NOT NULL DEFAULT 0,
    `can_read` TINYINT(1) NOT NULL DEFAULT 0,
    `can_update` TINYINT(1) NOT NULL DEFAULT 0,
    `can_delete` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY `roles_permissions_tenant_id_role_module_unique` (`tenant_id`, `role`, `module`),
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
