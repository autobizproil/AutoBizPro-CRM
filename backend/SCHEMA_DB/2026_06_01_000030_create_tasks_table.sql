CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    due_at DATETIME,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    related_type VARCHAR(30),
    related_id INTEGER,
    completed_at DATETIME,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);
CREATE INDEX idx_tasks_status ON tasks(tenant_id, status, due_at);
CREATE INDEX idx_tasks_assignee ON tasks(tenant_id, assigned_to);
CREATE INDEX idx_tasks_related ON tasks(related_type, related_id);
