-- Generalize CSV import beyond leads: entity = 'leads' or a record_type slug.
ALTER TABLE import_jobs
    ADD COLUMN IF NOT EXISTS entity VARCHAR(64) NOT NULL DEFAULT 'leads' AFTER user_id,
    ADD COLUMN IF NOT EXISTS record_type_id BIGINT UNSIGNED NULL AFTER entity;

ALTER TABLE import_jobs
    ADD CONSTRAINT import_jobs_record_type_id_foreign
        FOREIGN KEY (record_type_id) REFERENCES record_types (id) ON DELETE SET NULL;
