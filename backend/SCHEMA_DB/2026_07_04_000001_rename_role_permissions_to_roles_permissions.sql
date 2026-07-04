-- Align table name with Laravel model (App\Models\RolePermission => $table = 'roles_permissions')
-- and migration 2024_01_01_000009_create_roles_permissions_table.
RENAME TABLE role_permissions TO roles_permissions;
