import type { PoolClient } from "pg";
import pool from "../config/database.config";

export interface AdminLogListItem {
  id: number;
  admin_id: number;
  admin_display_name: string | null;
  admin_email: string | null;
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
  q?: string;
}

const ADMIN_LOG_SELECT = `
  al.id,
  al.admin_id,
  a.display_name AS admin_display_name,
  a.email AS admin_email,
  al.action,
  al.entity_type,
  al.entity_id,
  al.message,
  al.meta,
  al.created_at,
  al.updated_at
`;

export class AdminLogError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AdminLogError";
  }
}

function parseOptionalDateTime(
  value: string | undefined,
  field: string
): { iso: string; dateOnly: boolean } | null {
  if (value === undefined || String(value).trim() === "") {
    return null;
  }

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new AdminLogError(400, `${field} is invalid`);
    }
    return { iso: raw, dateOnly: true };
  }

  // datetime-local: YYYY-MM-DDTHH:mm or with seconds / timezone
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new AdminLogError(
      400,
      `${field} must be YYYY-MM-DD or ISO datetime`
    );
  }

  return { iso: date.toISOString(), dateOnly: false };
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
  const conditions: string[] = ["al.deleted_at IS NULL"];
  const params: unknown[] = [];

  if (filter.admin_id !== undefined) {
    const adminId = Number(filter.admin_id);
    if (!Number.isInteger(adminId) || adminId <= 0) {
      throw new AdminLogError(400, "admin_id is invalid");
    }
    params.push(adminId);
    conditions.push(`al.admin_id = $${params.length}`);
  }

  const action = filter.action?.trim();
  if (action) {
    params.push(action);
    conditions.push(`al.action = $${params.length}`);
  }

  const entityType = filter.entity_type?.trim();
  if (entityType) {
    params.push(entityType);
    conditions.push(`al.entity_type = $${params.length}`);
  }

  if (filter.entity_id !== undefined) {
    const entityId = Number(filter.entity_id);
    if (!Number.isInteger(entityId) || entityId <= 0) {
      throw new AdminLogError(400, "entity_id is invalid");
    }
    params.push(entityId);
    conditions.push(`al.entity_id = $${params.length}`);
  }

  const dateFrom = parseOptionalDateTime(filter.date_from, "date_from");
  if (dateFrom) {
    params.push(dateFrom.iso);
    if (dateFrom.dateOnly) {
      conditions.push(`al.created_at >= $${params.length}::date`);
    } else {
      conditions.push(`al.created_at >= $${params.length}::timestamptz`);
    }
  }

  const dateTo = parseOptionalDateTime(filter.date_to, "date_to");
  if (dateTo) {
    params.push(dateTo.iso);
    if (dateTo.dateOnly) {
      conditions.push(
        `al.created_at < ($${params.length}::date + INTERVAL '1 day')`
      );
    } else {
      conditions.push(`al.created_at <= $${params.length}::timestamptz`);
    }
  }

  const q = filter.q?.trim();
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    const idx = params.length;
    conditions.push(`(
      LOWER(COALESCE(al.message, '')) LIKE $${idx}
      OR LOWER(COALESCE(al.action, '')) LIKE $${idx}
      OR LOWER(COALESCE(al.entity_type, '')) LIKE $${idx}
      OR LOWER(COALESCE(a.display_name, '')) LIKE $${idx}
      OR LOWER(COALESCE(a.email, '')) LIKE $${idx}
      OR CAST(al.admin_id AS TEXT) LIKE $${idx}
      OR CAST(COALESCE(al.entity_id, 0) AS TEXT) LIKE $${idx}
    )`);
  }

  const result = await pool.query<AdminLogListItem>(
    `
      SELECT ${ADMIN_LOG_SELECT}
      FROM admin_log al
      LEFT JOIN admins a ON a.id = al.admin_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY al.id DESC
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
      SELECT ${ADMIN_LOG_SELECT}
      FROM admin_log al
      LEFT JOIN admins a ON a.id = al.admin_id
      WHERE al.id = $1
        AND al.deleted_at IS NULL
    `,
    [id]
  );
  return result.rows[0] ?? null;
}
