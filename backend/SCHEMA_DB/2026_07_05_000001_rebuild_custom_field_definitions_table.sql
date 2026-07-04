-- Rebuild custom_field_definitions: one row per field (system + custom) per entity.
-- Old table (module/key/type/position) was incompatible with all committed code.
DROP TABLE IF EXISTS custom_field_definitions;

CREATE TABLE custom_field_definitions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    entity VARCHAR(30) NOT NULL,
    name VARCHAR(80) NOT NULL,
    label VARCHAR(120) NOT NULL,
    field_type VARCHAR(30) NOT NULL,
    options JSON NULL,
    required TINYINT(1) NOT NULL DEFAULT 0,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    hidden TINYINT(1) NOT NULL DEFAULT 0,
    sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY cfd_tenant_entity_name_unique (tenant_id, entity, name),
    KEY cfd_tenant_entity_sort_index (tenant_id, entity, sort_order),
    CONSTRAINT cfd_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
