-- Migration: 004_ports_use_project_id
-- เปลี่ยน ports ให้ผูก project ผ่าน project_id แทน project_name

BEGIN;

ALTER TABLE ports
  ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects (id);

-- map จากชื่อเดิม (ถ้ามี) ไปยัง projects ที่ยัง active
UPDATE ports po
SET project_id = pr.id
FROM projects pr
WHERE po.project_id IS NULL
  AND po.project_name IS NOT NULL
  AND pr.name = po.project_name
  AND pr.deleted_at IS NULL;

-- ลบแถวที่ map ไม่ได้ (ข้อมูลทดลองที่ไม่มี project จริง)
DELETE FROM ports
WHERE project_id IS NULL;

ALTER TABLE ports
  ALTER COLUMN project_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS ports_project_id_active_idx
  ON ports (project_id)
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS ports_project_name_active_idx;

ALTER TABLE ports
  DROP COLUMN IF EXISTS project_name;

COMMENT ON COLUMN ports.project_id IS 'FK → projects.id project ที่ใช้ port นี้ — unique เฉพาะแถวที่ยังไม่ลบ';

COMMIT;
