import type { PoolClient } from "pg";
import pool from "../config/database.config";
import { insertAdminLog } from "./admin_log.service";

export interface ProjectListItem {
  id: number;
  name: string;
  description: string | null;
  resource_type_id: number;
  resource_type_code: string;
  resource_type_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  resource_type_id: number | string;
  is_active?: boolean;
  adminId?: number | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  resource_type_id?: number | string;
  is_active?: boolean;
  adminId?: number | null;
}

export interface ListProjectsFilter {
  is_active?: boolean;
  name?: string;
  resource_type_id?: number;
  resource_type_code?: string;
}

export class ProjectError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "ProjectError";
  }
}

const PROJECT_SELECT = `
  p.id,
  p.name,
  p.description,
  p.resource_type_id,
  rt.code AS resource_type_code,
  rt.name AS resource_type_name,
  p.is_active,
  p.created_at,
  p.updated_at
`;

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
  throw new ProjectError(400, `${field} must be a boolean`);
}

function parsePositiveId(value: unknown, field: string): number {
  const id = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ProjectError(400, `${field} is invalid`);
  }
  return id;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

async function assertProjectNameAvailable(
  client: PoolClient,
  name: string,
  excludeId?: number
): Promise<void> {
  const result = await client.query<{ id: number }>(
    `
      SELECT id
      FROM projects
      WHERE name = $1
        AND deleted_at IS NULL
        AND ($2::bigint IS NULL OR id <> $2)
      LIMIT 1
    `,
    [name, excludeId ?? null]
  );

  if (result.rows.length > 0) {
    throw new ProjectError(409, `Project '${name}' already exists`);
  }
}

async function assertResourceTypeActive(
  client: PoolClient,
  resourceTypeId: number
): Promise<void> {
  const result = await client.query<{ id: number }>(
    `
      SELECT id
      FROM resource_types
      WHERE id = $1
        AND deleted_at IS NULL
        AND is_active = TRUE
      LIMIT 1
    `,
    [resourceTypeId]
  );

  if (result.rows.length === 0) {
    throw new ProjectError(400, "resource_type_id is invalid or inactive");
  }
}

async function getProjectRowById(
  client: PoolClient | typeof pool,
  id: number
): Promise<ProjectListItem | null> {
  const result = await client.query<ProjectListItem>(
    `
      SELECT ${PROJECT_SELECT}
      FROM projects p
      INNER JOIN resource_types rt
        ON rt.id = p.resource_type_id
      WHERE p.id = $1
        AND p.deleted_at IS NULL
    `,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getActiveProjects(
  filter: ListProjectsFilter = {}
): Promise<ProjectListItem[]> {
  const conditions: string[] = ["p.deleted_at IS NULL"];
  const params: unknown[] = [];

  if (filter.is_active !== undefined) {
    params.push(filter.is_active);
    conditions.push(`p.is_active = $${params.length}`);
  }

  const name = filter.name?.trim();
  if (name) {
    params.push(`%${name}%`);
    conditions.push(`p.name ILIKE $${params.length}`);
  }

  if (filter.resource_type_id !== undefined) {
    const resourceTypeId = parsePositiveId(
      filter.resource_type_id,
      "resource_type_id"
    );
    params.push(resourceTypeId);
    conditions.push(`p.resource_type_id = $${params.length}`);
  }

  const resourceTypeCode = filter.resource_type_code?.trim().toLowerCase();
  if (resourceTypeCode) {
    params.push(resourceTypeCode);
    conditions.push(`rt.code = $${params.length}`);
  }

  const result = await pool.query<ProjectListItem>(
    `
      SELECT ${PROJECT_SELECT}
      FROM projects p
      INNER JOIN resource_types rt
        ON rt.id = p.resource_type_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY p.name ASC
    `,
    params
  );
  return result.rows;
}

export async function getActiveProjectById(
  id: number
): Promise<ProjectListItem | null> {
  return getProjectRowById(pool, id);
}

export async function createProject(
  input: CreateProjectInput
): Promise<ProjectListItem> {
  const name = String(input.name || "").trim();
  const description =
    input.description === undefined || input.description === null
      ? null
      : String(input.description).trim() || null;
  const resourceTypeId = parsePositiveId(
    input.resource_type_id,
    "resource_type_id"
  );
  const isActive = parseOptionalBoolean(input.is_active, "is_active") ?? true;

  if (!name) {
    throw new ProjectError(400, "name is required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertProjectNameAvailable(client, name);
    await assertResourceTypeActive(client, resourceTypeId);

    const inserted = await client.query<{ id: number }>(
      `
        INSERT INTO projects (name, description, resource_type_id, is_active)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [name, description, resourceTypeId, isActive]
    );
    const projectId = Number(inserted.rows[0].id);
    const project = await getProjectRowById(client, projectId);
    if (!project) {
      throw new ProjectError(500, "Failed to load created project");
    }

    await insertAdminLog(
      {
        adminId: input.adminId,
        action: "create",
        entityType: "project",
        entityId: project.id,
        message: `Created project ${project.name}`,
      },
      client
    );

    await client.query("COMMIT");
    return project;
  } catch (error) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(error)) {
      throw new ProjectError(409, `Project '${name}' already exists`);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function updateProject(
  id: number,
  input: UpdateProjectInput
): Promise<ProjectListItem> {
  const existing = await getActiveProjectById(id);
  if (!existing) {
    throw new ProjectError(404, "Project not found");
  }

  const nextName =
    input.name !== undefined ? String(input.name).trim() : existing.name;
  const nextDescription =
    input.description !== undefined
      ? input.description === null
        ? null
        : String(input.description).trim() || null
      : existing.description;
  const nextResourceTypeId =
    input.resource_type_id !== undefined
      ? parsePositiveId(input.resource_type_id, "resource_type_id")
      : existing.resource_type_id;
  const nextIsActive =
    input.is_active !== undefined
      ? (parseOptionalBoolean(input.is_active, "is_active") as boolean)
      : existing.is_active;

  if (!nextName) {
    throw new ProjectError(400, "name is required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (nextName !== existing.name) {
      await assertProjectNameAvailable(client, nextName, id);
    }
    if (nextResourceTypeId !== existing.resource_type_id) {
      await assertResourceTypeActive(client, nextResourceTypeId);
    }

    const updated = await client.query<{ id: number }>(
      `
        UPDATE projects
        SET name = $1,
            description = $2,
            resource_type_id = $3,
            is_active = $4
        WHERE id = $5
          AND deleted_at IS NULL
        RETURNING id
      `,
      [nextName, nextDescription, nextResourceTypeId, nextIsActive, id]
    );

    if (updated.rows.length === 0) {
      throw new ProjectError(404, "Project not found");
    }

    const project = await getProjectRowById(client, id);
    if (!project) {
      throw new ProjectError(404, "Project not found");
    }

    await insertAdminLog(
      {
        adminId: input.adminId,
        action: "update",
        entityType: "project",
        entityId: id,
        message: `Updated project ${id}`,
        meta: {
          before: existing,
          after: project,
        },
      },
      client
    );

    await client.query("COMMIT");
    return project;
  } catch (error) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(error)) {
      throw new ProjectError(409, `Project '${nextName}' already exists`);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function patchProjectIsActive(
  id: number,
  isActiveRaw: unknown,
  adminId?: number | null
): Promise<ProjectListItem> {
  const isActive = parseOptionalBoolean(isActiveRaw, "is_active");
  if (isActive === undefined) {
    throw new ProjectError(400, "is_active is required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const updated = await client.query<{ id: number }>(
      `
        UPDATE projects
        SET is_active = $1
        WHERE id = $2
          AND deleted_at IS NULL
        RETURNING id
      `,
      [isActive, id]
    );

    if (updated.rows.length === 0) {
      throw new ProjectError(404, "Project not found");
    }

    const project = await getProjectRowById(client, id);
    if (!project) {
      throw new ProjectError(404, "Project not found");
    }

    await insertAdminLog(
      {
        adminId,
        action: "update",
        entityType: "project",
        entityId: id,
        message: `Patched project ${id} is_active=${isActive}`,
      },
      client
    );

    await client.query("COMMIT");
    return project;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function softDeleteProject(
  id: number,
  adminId?: number | null
): Promise<ProjectListItem> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await getProjectRowById(client, id);
    if (!existing) {
      throw new ProjectError(404, "Project not found");
    }

    await client.query(
      `
        UPDATE projects
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
        entityType: "project",
        entityId: id,
        message: `Soft deleted project ${id}`,
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

export async function hardDeleteProject(
  id: number,
  adminId?: number | null
): Promise<{ id: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const found = await client.query<{ id: number; name: string }>(
      `SELECT id, name FROM projects WHERE id = $1 LIMIT 1`,
      [id]
    );

    if (found.rows.length === 0) {
      throw new ProjectError(404, "Project not found");
    }

    await client.query(`DELETE FROM projects WHERE id = $1`, [id]);

    await insertAdminLog(
      {
        adminId,
        action: "hard_delete",
        entityType: "project",
        entityId: id,
        message: `Hard deleted project ${found.rows[0].name}`,
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
