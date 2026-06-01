CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    phone_normalized VARCHAR(30),
    email VARCHAR(255),
    company VARCHAR(255),
    source VARCHAR(100),
    notes TEXT,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    source_lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    custom_fields TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);
CREATE INDEX idx_clients_tenant ON clients(tenant_id, created_at);
CREATE INDEX idx_clients_phone ON clients(tenant_id, phone_normalized);
