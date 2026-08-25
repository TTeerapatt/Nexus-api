-- Migration: 006_ports_add_resource_type
-- เพิ่ม resource_type ให้ ports แบบเดียวกับ projects
-- และเปลี่ยน unique เป็น (project_id, resource_type_id)

BEGIN;

ALTER TABLE ports
  ADD COLUMN IF NOT EXISTS resource_type_id BIGINT REFERENCES resource_types (id);

-- backfill จาก resource_type ของ project
UPDATE ports po
SET resource_type_id = pr.resource_type_id
FROM projects pr
WHERE po.resource_type_id IS NULL
  AND po.project_id = pr.id;

-- ถ้ายังไม่มี (ข้อมูลผิดปกติ) ใช้ resource_type แรกที่ active
UPDATE ports
SET resource_type_id = (
  SELECT id
  FROM resource_types
  WHERE deleted_at IS NULL
    AND is_active = TRUE
  ORDER BY id ASC
  LIMIT 1
)
WHERE resource_type_id IS NULL;

ALTER TABLE ports
  ALTER COLUMN resource_type_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS ports_resource_type_id_active_idx
  ON ports (resource_type_id)
  WHERE deleted_at IS NULL;

-- เปลี่ยน unique จาก project_id เดี่ยว เป็นคู่ project + resource_type
DROP INDEX IF EXISTS ports_project_id_active_uidx;
DROP INDEX IF EXISTS ports_project_id_active_idx;

CREATE UNIQUE INDEX IF NOT EXISTS ports_project_resource_type_active_uidx
  ON ports (project_id, resource_type_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN ports.resource_type_id IS 'FK → resource_types.id ประเภท resource ของ port';
COMMENT ON COLUMN ports.project_id IS 'FK → projects.id — unique คู่กับ resource_type_id เฉพาะแถวที่ยังไม่ลบ';

COMMIT;
