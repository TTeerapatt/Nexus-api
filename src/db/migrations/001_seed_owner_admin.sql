-- Migration: 001_seed_owner_admin
-- Seed owner admin + auth + full permissions
--
-- Default credentials (change after first login):
--   email:    owner@nexus.com
--   password: Owner@123456

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) admins (owner)
-- ---------------------------------------------------------------------------
INSERT INTO admins (email, display_name, role)
SELECT seed.email, seed.display_name, seed.role
FROM (
  VALUES
    ('owner@nexus.com', 'Owner', 'owner')
) AS seed(email, display_name, role)
WHERE NOT EXISTS (
  SELECT 1
  FROM admins a
  WHERE a.email = seed.email
    AND a.deleted_at IS NULL
);

-- ---------------------------------------------------------------------------
-- 2) admin_auth (bcrypt hash of Owner@123456, rounds=10)
-- ---------------------------------------------------------------------------
INSERT INTO admin_auth (admin_id, password_hash)
SELECT a.id, seed.password_hash
FROM admins a
CROSS JOIN (
  VALUES
    ('$2b$10$9We07yV6pKe6D0fXqQdr2uLKBF/c/mmKGik9Q5CAhzUtHkIIhtqla')
) AS seed(password_hash)
WHERE a.email = 'owner@nexus.com'
  AND a.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM admin_auth aa
    WHERE aa.admin_id = a.id
      AND aa.deleted_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- 3) admin_permissions — grant ทุก action ที่ tab รองรับ
-- ---------------------------------------------------------------------------
INSERT INTO admin_permissions (admin_id, menu_tab_action_id, is_allowed)
SELECT a.id, mta.id, TRUE
FROM admins a
CROSS JOIN admin_menu_tab_action mta
WHERE a.email = 'owner@nexus.com'
  AND a.deleted_at IS NULL
  AND mta.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM admin_permissions ap
    WHERE ap.admin_id = a.id
      AND ap.menu_tab_action_id = mta.id
      AND ap.deleted_at IS NULL
  );

COMMIT;
