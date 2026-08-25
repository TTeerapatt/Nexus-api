import type { PoolClient } from "pg";
import pool from "../config/database.config";
import { insertAdminLog } from "./admin_log.service";

export interface PortListItem {
  id: number;
  port_number: number;
  project_id: number;
  project_name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePortInput {
  port_number: number | string;
  project_id: number | string;
  description?: string | null;
  is_active?: boolean;
  adminId?: number | null;
}

export interface UpdatePortInput {
  port_number?: number | string;
  project_id?: number | string;
  description?: string | null;
  is_active?: boolean;
  adminId?: number | null;
}

export interface ListPortsFilter {
  is_active?: boolean;
  project_id?: number;
  project_name?: string;
  port_number?: number;
}

export class PortError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "PortError";
  }
}

const PORT_SELECT = `
  po.id,
  po.port_number,
  po.project_id,
  pr.name AS project_name,
  po.description,
  po.is_active,
  po.created_at,
  po.updated_at
`;

function parsePortNumber(value: unknown, field = "port_number"): number {
  const port = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new PortError(400, `${field} must be an integer between 1 and 65535`);
  }
  return port;
}

function parsePositiveId(value: unknown, field: string): number {
  const id = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new PortError(400, `${field} is invalid`);
  }
  return id;
}

function parseOptionalBoolean(
  value: unknown,
  field: string
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  throw new PortError(400, `${field} must be a boolean`);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

async function assertPortNumberAvailable(
  client: PoolClient,
  portNumber: number,
  excludeId?: number
): Promise<void> {
  const result = await client.query<{ id: number }>(
    `
      SELECT id
      FROM ports
      WHERE port_number = $1
        AND deleted_at IS NULL
        AND ($2::bigint IS NULL OR id <> $2)
      LIMIT 1
    `,
    [portNumber, excludeId ?? null]
  );

  if (result.rows.length > 0) {
    throw new PortError(409, `Port ${portNumber} already exists`);
  }
}

async function assertProjectAvailable(
  client: PoolClient,
  projectId: number,
  excludeId?: number
): Promise<void> {
  const result = await client.query<{ id: number; port_number: number }>(
    `
      SELECT id, port_number
      FROM ports
      WHERE project_id = $1
        AND deleted_at IS NULL
        AND ($2::bigint IS NULL OR id <> $2)
      LIMIT 1
    `,
    [projectId, excludeId ?? null]
  );

  if (result.rows.length > 0) {
    throw new PortError(
      409,
      `Project นี้ถูกใช้กับ port ${result.rows[0].port_number} แล้ว`
    );
  }
}

async function assertProjectActive(
  client: PoolClient,
  projectId: number
): Promise<void> {
  const result = await client.query<{ id: number }>(
    `
      SELECT id
      FROM projects
      WHERE id = $1
        AND deleted_at IS NULL
        AND is_active = TRUE
      LIMIT 1
    `,
    [projectId]
  );

  if (result.rows.length === 0) {
    throw new PortError(400, "project_id is invalid or inactive");
  }
}

async function getPortRowById(
  client: PoolClient | typeof pool,
  id: number
): Promise<PortListItem | null> {
  const result = await client.query<PortListItem>(
    `
      SELECT ${PORT_SELECT}
      FROM ports po
      INNER JOIN projects pr
        ON pr.id = po.project_id
      WHERE po.id = $1
        AND po.deleted_at IS NULL
    `,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getActivePorts(
  filter: ListPortsFilter = {}
): Promise<PortListItem[]> {
  const conditions: string[] = ["po.deleted_at IS NULL"];
  const params: unknown[] = [];

  if (filter.is_active !== undefined) {
    params.push(filter.is_active);
    conditions.push(`po.is_active = $${params.length}`);
  }

  if (filter.project_id !== undefined) {
    const projectId = parsePositiveId(filter.project_id, "project_id");
    params.push(projectId);
    conditions.push(`po.project_id = $${params.length}`);
  }

  const projectName = filter.project_name?.trim();
  if (projectName) {
    params.push(`%${projectName}%`);
    conditions.push(`pr.name ILIKE $${params.length}`);
  }

  if (filter.port_number !== undefined) {
    const portNumber = parsePortNumber(filter.port_number);
    params.push(portNumber);
    conditions.push(`po.port_number = $${params.length}`);
  }

  const result = await pool.query<PortListItem>(
    `
      SELECT ${PORT_SELECT}
      FROM ports po
      INNER JOIN projects pr
        ON pr.id = po.project_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY po.port_number ASC
    `,
    params
  );
  return result.rows;
}

export async function getActivePortById(
  id: number
): Promise<PortListItem | null> {
  return getPortRowById(pool, id);
}

export async function createPort(input: CreatePortInput): Promise<PortListItem> {
  const portNumber = parsePortNumber(input.port_number);
  const projectId = parsePositiveId(input.project_id, "project_id");
  const description =
    input.description === undefined || input.description === null
      ? null
      : String(input.description).trim() || null;
  const isActive = parseOptionalBoolean(input.is_active, "is_active") ?? true;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertPortNumberAvailable(client, portNumber);
    await assertProjectActive(client, projectId);
    await assertProjectAvailable(client, projectId);

    const inserted = await client.query<{ id: number }>(
      `
        INSERT INTO ports (port_number, project_id, description, is_active)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [portNumber, projectId, description, isActive]
    );
    const port = await getPortRowById(client, Number(inserted.rows[0].id));
    if (!port) {
      throw new PortError(500, "Failed to load created port");
    }

    await insertAdminLog(
      {
        adminId: input.adminId,
        action: "create",
        entityType: "port",
        entityId: port.id,
        message: `Created port ${port.port_number}`,
      },
      client
    );

    await client.query("COMMIT");
    return port;
  } catch (error) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(error)) {
      throw new PortError(
        409,
        "Port number or project is already assigned"
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function updatePort(
  id: number,
  input: UpdatePortInput
): Promise<PortListItem> {
  const existing = await getActivePortById(id);
  if (!existing) {
    throw new PortError(404, "Port not found");
  }

  const nextPortNumber =
    input.port_number !== undefined
      ? parsePortNumber(input.port_number)
      : existing.port_number;
  const nextProjectId =
    input.project_id !== undefined
      ? parsePositiveId(input.project_id, "project_id")
      : existing.project_id;
  const nextDescription =
    input.description !== undefined
      ? input.description === null
        ? null
        : String(input.description).trim() || null
      : existing.description;
  const nextIsActive =
    input.is_active !== undefined
      ? (parseOptionalBoolean(input.is_active, "is_active") as boolean)
      : existing.is_active;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (nextPortNumber !== existing.port_number) {
      await assertPortNumberAvailable(client, nextPortNumber, id);
    }
    if (nextProjectId !== existing.project_id) {
      await assertProjectActive(client, nextProjectId);
      await assertProjectAvailable(client, nextProjectId, id);
    }

    const updated = await client.query<{ id: number }>(
      `
        UPDATE ports
        SET port_number = $1,
            project_id = $2,
            description = $3,
            is_active = $4
        WHERE id = $5
          AND deleted_at IS NULL
        RETURNING id
      `,
      [nextPortNumber, nextProjectId, nextDescription, nextIsActive, id]
    );

    if (updated.rows.length === 0) {
      throw new PortError(404, "Port not found");
    }

    const port = await getPortRowById(client, id);
    if (!port) {
      throw new PortError(404, "Port not found");
    }

    await insertAdminLog(
      {
        adminId: input.adminId,
        action: "update",
        entityType: "port",
        entityId: id,
        message: `Updated port ${id}`,
        meta: {
          before: existing,
          after: port,
        },
      },
      client
    );

    await client.query("COMMIT");
    return port;
  } catch (error) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(error)) {
      throw new PortError(
        409,
        "Port number or project is already assigned"
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function patchPortIsActive(
  id: number,
  isActiveRaw: unknown,
  adminId?: number | null
): Promise<PortListItem> {
  const isActive = parseOptionalBoolean(isActiveRaw, "is_active");
  if (isActive === undefined) {
    throw new PortError(400, "is_active is required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const updated = await client.query<{ id: number }>(
      `
        UPDATE ports
        SET is_active = $1
        WHERE id = $2
          AND deleted_at IS NULL
        RETURNING id
      `,
      [isActive, id]
    );

    if (updated.rows.length === 0) {
      throw new PortError(404, "Port not found");
    }

    const port = await getPortRowById(client, id);
    if (!port) {
      throw new PortError(404, "Port not found");
    }

    await insertAdminLog(
      {
        adminId,
        action: "update",
        entityType: "port",
        entityId: id,
        message: `Patched port ${id} is_active=${isActive}`,
      },
      client
    );

    await client.query("COMMIT");
    return port;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function softDeletePort(
  id: number,
  adminId?: number | null
): Promise<PortListItem> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await getPortRowById(client, id);
    if (!existing) {
      throw new PortError(404, "Port not found");
    }

    await client.query(
      `
        UPDATE ports
        SET deleted_at = NOW(),
            is_active = FALSE
        WHERE id = $1
          AND deleted_at IS NULL
      `,
      [id]
    );

    await insertAdminLog(
      {
        adminId,
        action: "soft_delete",
        entityType: "port",
        entityId: id,
        message: `Soft deleted port ${id}`,
      },
      client
    );

    await client.query("COMMIT");
    return { ...existing, is_active: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function hardDeletePort(
  id: number,
  adminId?: number | null
): Promise<{ id: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const found = await client.query<{ id: number; port_number: number }>(
      `SELECT id, port_number FROM ports WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (found.rows.length === 0) {
      throw new PortError(404, "Port not found");
    }

    await client.query(`DELETE FROM ports WHERE id = $1`, [id]);

    await insertAdminLog(
      {
        adminId,
        action: "hard_delete",
        entityType: "port",
        entityId: id,
        message: `Hard deleted port ${found.rows[0].port_number}`,
      },
      client
    );

    await client.query("COMMIT");
    return { id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
