import type { PoolClient } from "pg";
import pool from "../config/database.config";

export interface AdminLogListItem {
  id: number;
  admin_id: number;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  message: string | null;
  meta: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface InsertAdminLogInput {
  adminId?: number | null;
  action: string;
  entityType?: string | null;
  entityId?: number | null;
  message?: string | null;
  meta?: unknown | null;
}

export interface ListAdminLogsFilter {
  admin_id?: number;
  action?: string;
  entity_type?: string;
  entity_id?: number;
  date_from?: string;
  date_to?: string;
}

export class AdminLogError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AdminLogError";
  }
}

function parseOptionalDate(
  value: string | undefined,
  field: string
): string | null {
  if (value === undefined || String(value).trim() === "") {
    return null;
  }
  const raw = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AdminLogError(400, `${field} must be YYYY-MM-DD`);
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new AdminLogError(400, `${field} is invalid`);
  }
  return raw;
}

/** เขียน admin_log — ข้ามถ้าไม่มี adminId (กัน FK error) */
export async function insertAdminLog(
  input: InsertAdminLogInput,
  client?: PoolClient
): Promise<void> {
  const adminId = Number(input.adminId);
  if (!Number.isInteger(adminId) || adminId <= 0) {
    return;
  }

  const action = String(input.action || "").trim();
  if (!action) {
    return;
  }

  const db = client ?? pool;
  await db.query(
    `
      INSERT INTO admin_log (
        admin_id, action, entity_type, entity_id, message, meta
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      adminId,
      action,
      input.entityType?.trim() || null,
      input.entityId ?? null,
      input.message?.trim() || null,
      input.meta !== undefined && input.meta !== null
        ? JSON.stringify(input.meta)
        : null,
    ]
  );
}

export async function getActiveAdminLogs(
  filter: ListAdminLogsFilter = {}
): Promise<AdminLogListItem[]> {
  const conditions: string[] = ["deleted_at IS NULL"];
  const params: unknown[] = [];

  if (filter.admin_id !== undefined) {
    const adminId = Number(filter.admin_id);
    if (!Number.isInteger(adminId) || adminId <= 0) {
      throw new AdminLogError(400, "admin_id is invalid");
    }
    params.push(adminId);
    conditions.push(`admin_id = $${params.length}`);
  }

  const action = filter.action?.trim();
  if (action) {
    params.push(action);
    conditions.push(`action = $${params.length}`);
  }

  const entityType = filter.entity_type?.trim();
  if (entityType) {
    params.push(entityType);
    conditions.push(`entity_type = $${params.length}`);
  }

  if (filter.entity_id !== undefined) {
    const entityId = Number(filter.entity_id);
    if (!Number.isInteger(entityId) || entityId <= 0) {
      throw new AdminLogError(400, "entity_id is invalid");
    }
    params.push(entityId);
    conditions.push(`entity_id = $${params.length}`);
  }

  const dateFrom = parseOptionalDate(filter.date_from, "date_from");
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`created_at >= $${params.length}::date`);
  }

  const dateTo = parseOptionalDate(filter.date_to, "date_to");
  if (dateTo) {
    params.push(dateTo);
    conditions.push(
      `created_at < ($${params.length}::date + INTERVAL '1 day')`
    );
  }

  const result = await pool.query<AdminLogListItem>(
    `
      SELECT
        id, admin_id, action, entity_type, entity_id,
        message, meta, created_at, updated_at
      FROM admin_log
      WHERE ${conditions.join(" AND ")}
      ORDER BY id DESC
    `,
    params
  );
  return result.rows;
}

export async function getActiveAdminLogById(
  id: number
): Promise<AdminLogListItem | null> {
  const result = await pool.query<AdminLogListItem>(
    `
      SELECT
        id, admin_id, action, entity_type, entity_id,
        message, meta, created_at, updated_at
      FROM admin_log
      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [id]
  );
  return result.rows[0] ?? null;
}
