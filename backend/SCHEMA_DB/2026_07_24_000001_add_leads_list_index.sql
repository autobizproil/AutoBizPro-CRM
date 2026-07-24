-- Fixes filesort on the default leads list query (tenant_id + deleted_at IS NULL + ORDER BY created_at DESC).
ALTER TABLE leads
    ADD INDEX leads_tenant_deleted_created_index (tenant_id, deleted_at, created_at);
