ALTER TABLE import_jobs
    ADD COLUMN IF NOT EXISTS status_mapping JSON NULL AFTER field_mapping;
