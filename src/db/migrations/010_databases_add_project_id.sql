-- Migration: 010_databases_add_project_id
-- ผูก databases กับ project เพื่อรู้ว่า instance นี้อยู่ของ project ไหน

BEGIN;

ALTER TABLE databases
  ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects (id);

COMMENT ON COLUMN databases.project_id IS 'FK → projects.id project ที่ใช้ database นี้';

DROP INDEX IF EXISTS databases_name_type_active_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS databases_name_type_project_active_uidx
  ON databases (name, all_database_id, project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS databases_project_id_active_idx
  ON databases (project_id)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM databases
    WHERE project_id IS NULL
  ) THEN
    ALTER TABLE databases
      ALTER COLUMN project_id SET NOT NULL;
  END IF;
END $$;

COMMIT;
