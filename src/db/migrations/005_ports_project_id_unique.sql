-- Migration: 005_ports_project_id_unique
-- 1 project ต่อ 1 port เท่านั้น (แถวที่ยังไม่ soft delete)

BEGIN;

-- เก็บแถว id น้อยสุดของแต่ละ project_id แล้ว soft delete ของซ้ำ
UPDATE ports
SET deleted_at = NOW(),
    is_active = FALSE
WHERE deleted_at IS NULL
  AND id NOT IN (
    SELECT keep_id
    FROM (
      SELECT MIN(id) AS keep_id
      FROM ports
      WHERE deleted_at IS NULL
      GROUP BY project_id
    ) AS keepers
  );

DROP INDEX IF EXISTS ports_project_id_active_idx;

CREATE UNIQUE INDEX IF NOT EXISTS ports_project_id_active_uidx
  ON ports (project_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN ports.project_id IS 'FK → projects.id project ที่ใช้ port นี้ — unique เฉพาะแถวที่ยังไม่ลบ';

COMMIT;
