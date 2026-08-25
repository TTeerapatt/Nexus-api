-- Migration: 007_projects_add_type
-- เพิ่ม type ของรายการ: project | service

BEGIN;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS type VARCHAR(32);

UPDATE projects
SET type = 'project'
WHERE type IS NULL;

ALTER TABLE projects
  ALTER COLUMN type SET DEFAULT 'project';

ALTER TABLE projects
  ALTER COLUMN type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_type_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_type_check
      CHECK (type IN ('project', 'service'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS projects_type_active_idx
  ON projects (type)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN projects.type IS 'ชนิดรายการ: project | service';

COMMIT;
