CREATE TABLE custom_field_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(80) NOT NULL,
    label VARCHAR(120) NOT NULL,
    field_type VARCHAR(30) NOT NULL,
    options TEXT,
    required TINYINT(1) NOT NULL DEFAULT 0,
    sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    UNIQUE(tenant_id, name)
);
CREATE INDEX idx_cfd_tenant_sort ON custom_field_definitions(tenant_id, sort_order);
