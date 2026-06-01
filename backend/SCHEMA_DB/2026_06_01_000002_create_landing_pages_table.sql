CREATE TABLE landing_pages (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id     BIGINT UNSIGNED NOT NULL,
    title         VARCHAR(255)    NOT NULL,
    slug          VARCHAR(100)    NOT NULL,
    blocks        JSON            NOT NULL,
    settings      JSON            NULL,
    status        ENUM('draft','published') NOT NULL DEFAULT 'draft',
    views         INT UNSIGNED    NOT NULL DEFAULT 0,
    created_at    TIMESTAMP       NULL,
    updated_at    TIMESTAMP       NULL,

    PRIMARY KEY (id),
    UNIQUE KEY landing_pages_tenant_id_slug_unique (tenant_id, slug),
    CONSTRAINT fk_landing_pages_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants (id)
        ON DELETE CASCADE
);
