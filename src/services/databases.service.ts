import type { PoolClient } from "pg";
import pool from "../config/database.config";
import { insertAdminLog } from "./admin_log.service";

export interface DatabaseListItem {
  id: number;
  name: string;
  project_id: number;
  project_name: string;
  project_type: "project" | "service";
  all_database_id: number;
  all_database_code: string;
  all_database_name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDatabaseInput {
  name: string;
  project_id: number | string;
  all_database_id: number | string;
  description?: string | null;
  is_active?: boolean;
  adminId?: number | null;
}

export interface UpdateDatabaseInput {
  name?: string;
  project_id?: number | string;
  all_database_id?: number | string;
  description?: string | null;
  is_active?: boolean;
  adminId?: number | null;
}

export interface ListDatabasesFilter {
  is_active?: boolean;
  name?: string;
  project_id?: number;
  project_name?: string;
  all_database_id?: number;
  all_database_code?: string;
}

export class DatabaseError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

const DATABASE_SELECT = `
  d.id,
  d.name,
  d.project_id,
  pr.name AS project_name,
  pr.type AS project_type,
  d.all_database_id,
  ad.code AS all_database_code,
  ad.name AS all_database_name,
  d.description,
  d.is_active,
  d.created_at,
  d.updated_at
`;

function parsePositiveId(value: unknown, field: string): number {
  const id = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new DatabaseError(400, `${field} is invalid`);
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
  throw new DatabaseError(400, `${field} must be a boolean`);
}

function parseRequiredName(value: unknown): string {
  const name = String(value ?? "").trim();
  if (!name) {
    throw new DatabaseError(400, "name is required");
  }
  if (name.length > 255) {
    throw new DatabaseError(400, "name must be at most 255 characters");
  }
  return name;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

async function assertAllDatabaseExists(
  client: PoolClient,
  allDatabaseId: number
): Promise<void> {
  const result = await client.query<{ id: number }>(
    `
      SELECT id
      FROM all_database
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [allDatabaseId]
  );

  if (result.rows.length === 0) {
    throw new DatabaseError(400, "all_database_id is invalid");
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
    throw new DatabaseError(400, "project_id is invalid or inactive");
  }
}

async function assertNameTypeProjectAvailable(
  client: PoolClient,
  name: string,
  allDatabaseId: number,
  projectId: number,
  excludeId?: number
): Promise<void> {
  const result = await client.query<{ id: number }>(
    `
      SELECT id
      FROM databases
      WHERE name = $1
        AND all_database_id = $2
        AND project_id = $3
        AND deleted_at IS NULL
        AND ($4::bigint IS NULL OR id <> $4)
      LIMIT 1
    `,
    [name, allDatabaseId, projectId, excludeId ?? null]
  );

  if (result.rows.length > 0) {
    throw new DatabaseError(
      409,
      `Database '${name}' already exists for this project and type`
    );
  }
}

async function getDatabaseRowById(
  client: PoolClient | typeof pool,
  id: number
): Promise<DatabaseListItem | null> {
  const result = await client.query<DatabaseListItem>(
    `
      SELECT ${DATABASE_SELECT}
      FROM databases d
      INNER JOIN projects pr
        ON pr.id = d.project_id
      INNER JOIN all_database ad
        ON ad.id = d.all_database_id
      WHERE d.id = $1
        AND d.deleted_at IS NULL
    `,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getActiveDatabases(
  filter: ListDatabasesFilter = {}
): Promise<DatabaseListItem[]> {
  const conditions: string[] = ["d.deleted_at IS NULL"];
  const params: unknown[] = [];

  if (filter.is_active !== undefined) {
    params.push(filter.is_active);
    conditions.push(`d.is_active = $${params.length}`);
  }

  const name = filter.name?.trim();
  if (name) {
    params.push(`%${name}%`);
    conditions.push(`d.name ILIKE $${params.length}`);
  }

  if (filter.project_id !== undefined) {
    const projectId = parsePositiveId(filter.project_id, "project_id");
    params.push(projectId);
    conditions.push(`d.project_id = $${params.length}`);
  }

  const projectName = filter.project_name?.trim();
  if (projectName) {
    params.push(`%${projectName}%`);
    conditions.push(`pr.name ILIKE $${params.length}`);
  }

  if (filter.all_database_id !== undefined) {
    const allDatabaseId = parsePositiveId(
      filter.all_database_id,
      "all_database_id"
    );
    params.push(allDatabaseId);
    conditions.push(`d.all_database_id = $${params.length}`);
  }

  const allDatabaseCode = filter.all_database_code?.trim().toLowerCase();
  if (allDatabaseCode) {
    params.push(allDatabaseCode);
    conditions.push(`ad.code = $${params.length}`);
  }

  const result = await pool.query<DatabaseListItem>(
    `
      SELECT ${DATABASE_SELECT}
      FROM databases d
      INNER JOIN projects pr
        ON pr.id = d.project_id
      INNER JOIN all_database ad
        ON ad.id = d.all_database_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY d.id ASC
    `,
    params
  );
  return result.rows;
}

export async function getActiveDatabaseById(
  id: number
): Promise<DatabaseListItem | null> {
  return getDatabaseRowById(pool, id);
}

export async function createDatabase(
  input: CreateDatabaseInput
): Promise<DatabaseListItem> {
  const name = parseRequiredName(input.name);
  const projectId = parsePositiveId(input.project_id, "project_id");
  const allDatabaseId = parsePositiveId(
    input.all_database_id,
    "all_database_id"
  );
  const description =
    input.description === undefined || input.description === null
      ? null
      : String(input.description).trim() || null;
  const isActive = parseOptionalBoolean(input.is_active, "is_active") ?? true;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertProjectActive(client, projectId);
    await assertAllDatabaseExists(client, allDatabaseId);
    await assertNameTypeProjectAvailable(
      client,
      name,
      allDatabaseId,
      projectId
    );

    const inserted = await client.query<{ id: number }>(
      `
        INSERT INTO databases (
          name, project_id, all_database_id, description, is_active
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [name, projectId, allDatabaseId, description, isActive]
    );

    const row = await getDatabaseRowById(client, Number(inserted.rows[0].id));
    if (!row) {
      throw new DatabaseError(500, "Failed to load created database");
    }

    await insertAdminLog(
      {
        adminId: input.adminId,
        action: "create",
        entityType: "database",
        entityId: row.id,
        message: `Created database ${row.name}`,
      },
      client
    );

    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(error)) {
      throw new DatabaseError(
        409,
        "Database name + type + project already exists"
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function updateDatabase(
  id: number,
  input: UpdateDatabaseInput
): Promise<DatabaseListItem> {
  const existing = await getActiveDatabaseById(id);
  if (!existing) {
    throw new DatabaseError(404, "Database not found");
  }

  const nextName =
    input.name !== undefined ? parseRequiredName(input.name) : existing.name;
  const nextProjectId =
    input.project_id !== undefined
      ? parsePositiveId(input.project_id, "project_id")
      : existing.project_id;
  const nextAllDatabaseId =
    input.all_database_id !== undefined
      ? parsePositiveId(input.all_database_id, "all_database_id")
      : existing.all_database_id;
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

    if (nextProjectId !== existing.project_id) {
      await assertProjectActive(client, nextProjectId);
    }
    if (nextAllDatabaseId !== existing.all_database_id) {
      await assertAllDatabaseExists(client, nextAllDatabaseId);
    }
    if (
      nextName !== existing.name ||
      nextAllDatabaseId !== existing.all_database_id ||
      nextProjectId !== existing.project_id
    ) {
      await assertNameTypeProjectAvailable(
        client,
        nextName,
        nextAllDatabaseId,
        nextProjectId,
        id
      );
    }

    const updated = await client.query<{ id: number }>(
      `
        UPDATE databases
        SET name = $1,
            project_id = $2,
            all_database_id = $3,
            description = $4,
            is_active = $5
        WHERE id = $6
          AND deleted_at IS NULL
        RETURNING id
      `,
      [
        nextName,
        nextProjectId,
        nextAllDatabaseId,
        nextDescription,
        nextIsActive,
        id,
      ]
    );

    if (updated.rows.length === 0) {
      throw new DatabaseError(404, "Database not found");
    }

    const row = await getDatabaseRowById(client, id);
    if (!row) {
      throw new DatabaseError(404, "Database not found");
    }

    await insertAdminLog(
      {
        adminId: input.adminId,
        action: "update",
        entityType: "database",
        entityId: id,
        message: `Updated database ${id}`,
        meta: {
          before: existing,
          after: row,
        },
      },
      client
    );

    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(error)) {
      throw new DatabaseError(
        409,
        "Database name + type + project already exists"
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function patchDatabaseIsActive(
  id: number,
  isActiveRaw: unknown,
  adminId?: number | null
): Promise<DatabaseListItem> {
  const isActive = parseOptionalBoolean(isActiveRaw, "is_active");
  if (isActive === undefined) {
    throw new DatabaseError(400, "is_active is required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const updated = await client.query<{ id: number }>(
      `
        UPDATE databases
        SET is_active = $1
        WHERE id = $2
          AND deleted_at IS NULL
        RETURNING id
      `,
      [isActive, id]
    );

    if (updated.rows.length === 0) {
      throw new DatabaseError(404, "Database not found");
    }

    const row = await getDatabaseRowById(client, id);
    if (!row) {
      throw new DatabaseError(404, "Database not found");
    }

    await insertAdminLog(
      {
        adminId,
        action: "update",
        entityType: "database",
        entityId: id,
        message: `Patched database ${id} is_active=${isActive}`,
      },
      client
    );

    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function softDeleteDatabase(
  id: number,
  adminId?: number | null
): Promise<DatabaseListItem> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await getDatabaseRowById(client, id);
    if (!existing) {
      throw new DatabaseError(404, "Database not found");
    }

    await client.query(
      `
        UPDATE databases
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
        entityType: "database",
        entityId: id,
        message: `Soft deleted database ${id}`,
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

export async function hardDeleteDatabase(
  id: number,
  adminId?: number | null
): Promise<{ id: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const found = await client.query<{ id: number; name: string }>(
      `SELECT id, name FROM databases WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (found.rows.length === 0) {
      throw new DatabaseError(404, "Database not found");
    }

    await client.query(`DELETE FROM databases WHERE id = $1`, [id]);

    await insertAdminLog(
      {
        adminId,
        action: "hard_delete",
        entityType: "database",
        entityId: id,
        message: `Hard deleted database ${found.rows[0].name}`,
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
