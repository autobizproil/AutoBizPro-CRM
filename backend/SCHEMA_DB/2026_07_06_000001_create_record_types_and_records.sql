-- Custom record types (user-defined entities, e.g. חשבוניות מס / קבלות)
CREATE TABLE IF NOT EXISTS record_types (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    slug VARCHAR(64) NOT NULL,
    label VARCHAR(120) NOT NULL,
    label_singular VARCHAR(120) NULL,
    icon VARCHAR(16) NULL,
    position INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY record_types_tenant_slug_unique (tenant_id, slug),
    CONSTRAINT record_types_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Generic records: one row per record, all user fields inside `data` JSON
CREATE TABLE IF NOT EXISTS records (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT UNSIGNED NOT NULL,
    record_type_id BIGINT UNSIGNED NOT NULL,
    data JSON NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    KEY records_tenant_type_idx (tenant_id, record_type_id),
    CONSTRAINT records_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    CONSTRAINT records_type_fk FOREIGN KEY (record_type_id) REFERENCES record_types(id) ON DELETE CASCADE,
    CONSTRAINT records_user_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
