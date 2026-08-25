import bcrypt from "bcrypt";
import type { PoolClient } from "pg";
import pool from "../config/database.config";
import { insertAdminLog } from "./admin_log.service";

const BCRYPT_ROUNDS = 10;
const ALLOWED_ROLES = ["owner", "admin", "staff"] as const;

export interface AdminListItem {
  id: number;
  email: string;
  display_name: string;
  role: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminPermissionsTabItem {
  code: string;
  name: string;
  actions: Record<string, boolean>;
}

export interface AdminPermissionsMenuItem {
  code: string;
  name: string;
  tabs: AdminPermissionsTabItem[];
}

export interface AdminPermissionsByIdResult {
  admin: AdminListItem;
  menu: AdminPermissionsMenuItem[];
}

export interface UpdateAdminInput {
  email?: string;
  display_name?: string;
  role?: string;
  password?: string;
  permissions?: AdminPermissionInput[];
  adminId?: number | null;
}

export interface CreateAdminByAdminInput {
  email: string;
  password: string;
  display_name: string;
  role?: string;
  permissions?: AdminPermissionInput[];
  adminId?: number | null;
}

export interface AdminPermissionInput {
  tab_code: string;
  action_codes: string[];
}

export class AdminError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AdminError";
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePermissionInput(
  permissions: AdminPermissionInput[] | undefined
): Array<{ tab_code: string; action_codes: string[] }> | undefined {
  if (permissions === undefined) {
    return undefined;
  }
  if (!Array.isArray(permissions)) {
    throw new AdminError(400, "permissions must be an array");
  }

  const normalizedByTab = new Map<string, Set<string>>();
  for (const permission of permissions) {
    const tabCode = String(permission?.tab_code ?? "").trim().toLowerCase();
    if (!tabCode) {
      throw new AdminError(400, "permissions[].tab_code is required");
    }
    if (!Array.isArray(permission?.action_codes)) {
      throw new AdminError(400, "permissions[].action_codes must be an array");
    }

    const actionSet = normalizedByTab.get(tabCode) ?? new Set<string>();
    for (const action of permission.action_codes) {
      const actionCode = String(action ?? "").trim().toLowerCase();
      if (!actionCode) {
        throw new AdminError(400, "permissions[].action_codes has invalid value");
      }
      actionSet.add(actionCode);
    }
    normalizedByTab.set(tabCode, actionSet);
  }

  return Array.from(normalizedByTab.entries()).map(([tab_code, actionSet]) => ({
    tab_code,
    action_codes: Array.from(actionSet),
  }));
}

async function replaceAdminPermissions(
  client: PoolClient,
  adminId: number,
  permissions: Array<{ tab_code: string; action_codes: string[] }>
): Promise<void> {
  await client.query(
    `
      UPDATE admin_permissions
      SET deleted_at = NOW()
      WHERE admin_id = $1
        AND deleted_at IS NULL
    `,
    [adminId]
  );

  if (permissions.length === 0) {
    return;
  }

  const requestedPairs: Array<{ tab_code: string; action_code: string }> = [];
  for (const permission of permissions) {
    for (const actionCode of permission.action_codes) {
      requestedPairs.push({
        tab_code: permission.tab_code,
        action_code: actionCode,
      });
    }
  }

  if (requestedPairs.length === 0) {
    return;
  }

  const tabCodes = Array.from(new Set(requestedPairs.map((pair) => pair.tab_code)));
  const actionCodes = Array.from(
    new Set(requestedPairs.map((pair) => pair.action_code))
  );

  const mappingResult = await client.query<{
    menu_tab_action_id: number;
    tab_code: string;
    action_code: string;
  }>(
    `
      SELECT
        mta.id AS menu_tab_action_id,
        mt.code AS tab_code,
        pa.code AS action_code
      FROM admin_menu_tab_action mta
      INNER JOIN admin_menu_tab mt
        ON mt.id = mta.menu_tab_id
       AND mt.deleted_at IS NULL
       AND mt.is_active = TRUE
      INNER JOIN admin_menu_label ml
        ON ml.id = mt.menu_label_id
       AND ml.deleted_at IS NULL
       AND ml.is_active = TRUE
      INNER JOIN admin_permission_action pa
        ON pa.id = mta.permission_action_id
       AND pa.deleted_at IS NULL
       AND pa.is_active = TRUE
      WHERE mta.deleted_at IS NULL
        AND mt.code = ANY($1::text[])
        AND pa.code = ANY($2::text[])
    `,
    [tabCodes, actionCodes]
  );

  const pairToMenuTabActionId = new Map<string, number>();
  for (const row of mappingResult.rows) {
    pairToMenuTabActionId.set(
      `${row.tab_code}::${row.action_code}`,
      Number(row.menu_tab_action_id)
    );
  }

  const menuTabActionIds: number[] = [];
  for (const pair of requestedPairs) {
    const key = `${pair.tab_code}::${pair.action_code}`;
    const menuTabActionId = pairToMenuTabActionId.get(key);
    if (!menuTabActionId) {
      throw new AdminError(
        400,
        `Permission mapping not found for tab '${pair.tab_code}' and action '${pair.action_code}'`
      );
    }
    menuTabActionIds.push(menuTabActionId);
  }

  const uniqueMenuTabActionIds = Array.from(new Set(menuTabActionIds));
  for (const menuTabActionId of uniqueMenuTabActionIds) {
    await client.query(
      `
        INSERT INTO admin_permissions (admin_id, menu_tab_action_id, is_allowed)
        VALUES ($1, $2, TRUE)
      `,
      [adminId, menuTabActionId]
    );
  }
}

export async function createAdminByAdmin(
  input: CreateAdminByAdminInput
): Promise<AdminListItem> {
  const email = normalizeEmail(input.email || "");
  const password = String(input.password || "").trim();
  const displayName = String(input.display_name || "").trim();
  const role = String(input.role || "staff").trim();
  const permissions = normalizePermissionInput(input.permissions);

  if (!email || !isValidEmail(email)) {
    throw new AdminError(400, "Valid email is required");
  }
  if (password.length < 6) {
    throw new AdminError(400, "Password must be at least 6 characters");
  }
  if (!displayName) {
    throw new AdminError(400, "display_name is required");
  }
  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    throw new AdminError(400, "role must be one of: owner, admin, staff");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const duplicate = await client.query(
      `
        SELECT id
        FROM admins
        WHERE email = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [email]
    );
    if (duplicate.rows.length > 0) {
      throw new AdminError(409, "Email already exists");
    }

    const inserted = await client.query<AdminListItem>(
      `
        INSERT INTO admins (email, display_name, role)
        VALUES ($1, $2, $3)
        RETURNING id, email, display_name, role, last_login_at, created_at, updated_at
      `,
      [email, displayName, role]
    );
    const admin = inserted.rows[0];

    await client.query(
      `
        INSERT INTO admin_auth (admin_id, password_hash)
        VALUES ($1, $2)
      `,
      [admin.id, passwordHash]
    );

    if (permissions !== undefined) {
      await replaceAdminPermissions(client, admin.id, permissions);
    }

    await insertAdminLog(
      {
        adminId: input.adminId,
        action: "create",
        entityType: "admin",
        entityId: admin.id,
        message: `Created admin ${admin.id}`,
      },
      client
    );

    await client.query("COMMIT");
    return admin;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getActiveAdmins(): Promise<AdminListItem[]> {
  const query = `
    SELECT id, email, display_name, role, last_login_at, created_at, updated_at
    FROM admins
    WHERE deleted_at IS NULL
    ORDER BY id DESC
  `;

  const result = await pool.query<AdminListItem>(query);
  return result.rows;
}

export async function getActiveAdminById(
  id: number
): Promise<AdminListItem | null> {
  const query = `
    SELECT id, email, display_name, role, last_login_at, created_at, updated_at
    FROM admins
    WHERE id = $1
      AND deleted_at IS NULL
  `;

  const result = await pool.query<AdminListItem>(query, [id]);
  return result.rows[0] ?? null;
}

export async function getAdminPermissionsById(
  id: number
): Promise<AdminPermissionsByIdResult> {
  const admin = await getActiveAdminById(id);
  if (!admin) {
    throw new AdminError(404, "Admin not found");
  }

  const permissionRows = await pool.query<{
    menu_code: string;
    menu_name: string;
    menu_sort_order: number;
    tab_code: string;
    tab_name: string;
    tab_sort_order: number;
    action_code: string;
    is_allowed: boolean;
  }>(
    `
      SELECT
        ml.code AS menu_code,
        ml.name AS menu_name,
        ml.sort_order AS menu_sort_order,
        mt.code AS tab_code,
        mt.name AS tab_name,
        mt.sort_order AS tab_sort_order,
        pa.code AS action_code,
        CASE
          WHEN ap.id IS NOT NULL AND ap.is_allowed = TRUE THEN TRUE
          ELSE FALSE
        END AS is_allowed
      FROM admin_menu_label ml
      INNER JOIN admin_menu_tab mt
        ON mt.menu_label_id = ml.id
       AND mt.deleted_at IS NULL
       AND mt.is_active = TRUE
      INNER JOIN admin_menu_tab_action mta
        ON mta.menu_tab_id = mt.id
       AND mta.deleted_at IS NULL
      INNER JOIN admin_permission_action pa
        ON pa.id = mta.permission_action_id
       AND pa.deleted_at IS NULL
       AND pa.is_active = TRUE
      LEFT JOIN admin_permissions ap
        ON ap.menu_tab_action_id = mta.id
       AND ap.admin_id = $1
       AND ap.deleted_at IS NULL
      WHERE ml.deleted_at IS NULL
        AND ml.is_active = TRUE
      ORDER BY ml.sort_order ASC, mt.sort_order ASC, pa.sort_order ASC
    `,
    [id]
  );

  const menuMap = new Map<string, AdminPermissionsMenuItem>();
  const tabMap = new Map<string, AdminPermissionsTabItem>();
  const isOwner = admin.role === "owner";

  for (const row of permissionRows.rows) {
    let menuItem = menuMap.get(row.menu_code);
    if (!menuItem) {
      menuItem = {
        code: row.menu_code,
        name: row.menu_name,
        tabs: [],
      };
      menuMap.set(row.menu_code, menuItem);
    }

    const tabKey = `${row.menu_code}::${row.tab_code}`;
    let tabItem = tabMap.get(tabKey);
    if (!tabItem) {
      tabItem = {
        code: row.tab_code,
        name: row.tab_name,
        actions: {},
      };
      tabMap.set(tabKey, tabItem);
      menuItem.tabs.push(tabItem);
    }

    tabItem.actions[row.action_code] = isOwner ? true : row.is_allowed;
  }

  return {
    admin,
    menu: Array.from(menuMap.values()),
  };
}

export async function updateAdmin(
  id: number,
  input: UpdateAdminInput
): Promise<AdminListItem> {
  const existing = await getActiveAdminById(id);
  if (!existing) {
    throw new AdminError(404, "Admin not found");
  }

  const nextEmail =
    input.email !== undefined ? normalizeEmail(input.email) : existing.email;
  const nextDisplayName =
    input.display_name !== undefined
      ? input.display_name.trim()
      : existing.display_name;
  const nextRole =
    input.role !== undefined ? input.role.trim() : existing.role;
  const nextPassword =
    input.password !== undefined ? input.password.trim() : undefined;
  const permissions = normalizePermissionInput(input.permissions);

  if (input.email !== undefined && (!nextEmail || !isValidEmail(nextEmail))) {
    throw new AdminError(400, "Valid email is required");
  }
  if (input.display_name !== undefined && !nextDisplayName) {
    throw new AdminError(400, "display_name is required");
  }
  if (
    input.role !== undefined &&
    !ALLOWED_ROLES.includes(nextRole as (typeof ALLOWED_ROLES)[number])
  ) {
    throw new AdminError(400, "role must be one of: owner, admin, staff");
  }
  if (input.password !== undefined && (!nextPassword || nextPassword.length < 6)) {
    throw new AdminError(400, "Password must be at least 6 characters");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (nextEmail !== existing.email) {
      const duplicate = await client.query(
        `
          SELECT id
          FROM admins
          WHERE email = $1
            AND id <> $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [nextEmail, id]
      );
      if (duplicate.rows.length > 0) {
        throw new AdminError(409, "Email already exists");
      }
    }

    const updated = await client.query<AdminListItem>(
      `
        UPDATE admins
        SET email = $1,
            display_name = $2,
            role = $3
        WHERE id = $4
          AND deleted_at IS NULL
        RETURNING id, email, display_name, role, last_login_at, created_at, updated_at
      `,
      [nextEmail, nextDisplayName, nextRole, id]
    );

    if (nextPassword) {
      const passwordHash = await bcrypt.hash(nextPassword, BCRYPT_ROUNDS);
      await client.query(
        `
          UPDATE admin_auth
          SET password_hash = $1
          WHERE admin_id = $2
            AND deleted_at IS NULL
        `,
        [passwordHash, id]
      );
    }

    if (permissions !== undefined) {
      await replaceAdminPermissions(client, id, permissions);
    }

    await insertAdminLog(
      {
        adminId: input.adminId,
        action: "update",
        entityType: "admin",
        entityId: id,
        message: `Updated admin ${id}`,
      },
      client
    );

    await client.query("COMMIT");
    return updated.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function softDeleteAdmin(
  id: number,
  adminId?: number | null
): Promise<AdminListItem> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const updated = await client.query<AdminListItem>(
      `
        UPDATE admins
        SET deleted_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING id, email, display_name, role, last_login_at, created_at, updated_at
      `,
      [id]
    );

    if (updated.rows.length === 0) {
      throw new AdminError(404, "Admin not found");
    }

    await client.query(
      `
        UPDATE admin_auth
        SET deleted_at = NOW()
        WHERE admin_id = $1
          AND deleted_at IS NULL
      `,
      [id]
    );

    await insertAdminLog(
      {
        adminId,
        action: "soft_delete",
        entityType: "admin",
        entityId: id,
        message: `Soft deleted admin ${id}`,
      },
      client
    );

    await client.query("COMMIT");
    return updated.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function hardDeleteAdmin(
  id: number,
  adminId?: number | null
): Promise<{ id: number }> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const found = await client.query<{ id: number }>(
      `SELECT id FROM admins WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (found.rows.length === 0) {
      throw new AdminError(404, "Admin not found");
    }

    await client.query(`DELETE FROM admin_auth WHERE admin_id = $1`, [id]);
    await client.query(`DELETE FROM admin_permissions WHERE admin_id = $1`, [id]);
    await client.query(
      `UPDATE orders SET admin_id = NULL WHERE admin_id = $1`,
      [id]
    );
    await client.query(
      `UPDATE order_log SET admin_id = NULL WHERE admin_id = $1`,
      [id]
    );
    await client.query(`DELETE FROM admin_log WHERE admin_id = $1`, [id]);

    // Skip self hard-delete log — admin_log.admin_id FK would block DELETE admins
    if (adminId == null || Number(adminId) !== Number(id)) {
      await insertAdminLog(
        {
          adminId,
          action: "hard_delete",
          entityType: "admin",
          entityId: id,
          message: `Hard deleted admin ${id}`,
        },
        client
      );
    }

    await client.query(`DELETE FROM admins WHERE id = $1`, [id]);

    await client.query("COMMIT");
    return { id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
