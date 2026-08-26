import type { Request, Response, NextFunction } from "express";
import {
  DatabaseError,
  createDatabase,
  getActiveDatabaseById,
  getActiveDatabases,
  hardDeleteDatabase,
  patchDatabaseIsActive,
  softDeleteDatabase,
  updateDatabase,
} from "../services/databases.service";

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function parseIdParam(value: string | string[] | undefined): number | null {
  const id = Number(routeParam(value));
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value[0] !== undefined ? String(value[0]) : undefined;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

function parseOptionalBooleanQuery(
  value: string | undefined
): boolean | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new DatabaseError(400, "is_active must be a boolean");
}

function parseOptionalPositiveIntQuery(
  value: string | undefined,
  field: string
): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new DatabaseError(400, `${field} is invalid`);
  }
  return id;
}

function handleDatabaseError(
  error: unknown,
  res: Response,
  next: NextFunction
): void {
  if (error instanceof DatabaseError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }
  next(error);
}

export async function getDatabasesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const databases = await getActiveDatabases({
      is_active: parseOptionalBooleanQuery(firstQueryValue(req.query.is_active)),
      name: firstQueryValue(req.query.name),
      all_database_id: parseOptionalPositiveIntQuery(
        firstQueryValue(req.query.all_database_id),
        "all_database_id"
      ),
      all_database_code: firstQueryValue(req.query.all_database_code),
    });
    res.status(200).json({
      success: true,
      data: databases,
    });
  } catch (error) {
    handleDatabaseError(error, res, next);
  }
}

export async function getDatabaseByIdController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      res.status(400).json({
        success: false,
        message: "Invalid id",
      });
      return;
    }

    const database = await getActiveDatabaseById(id);
    if (!database) {
      res.status(404).json({
        success: false,
        message: "Database not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: database,
    });
  } catch (error) {
    next(error);
  }
}

export async function createDatabaseController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const database = await createDatabase({
      name: req.body?.name,
      all_database_id: req.body?.all_database_id,
      description: req.body?.description,
      is_active: req.body?.is_active,
      adminId: req.admin?.adminId ?? null,
    });

    res.status(201).json({
      success: true,
      data: database,
    });
  } catch (error) {
    handleDatabaseError(error, res, next);
  }
}

export async function updateDatabaseController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      res.status(400).json({
        success: false,
        message: "Invalid id",
      });
      return;
    }

    const database = await updateDatabase(id, {
      name: req.body?.name,
      all_database_id: req.body?.all_database_id,
      description: req.body?.description,
      is_active: req.body?.is_active,
      adminId: req.admin?.adminId ?? null,
    });

    res.status(200).json({
      success: true,
      data: database,
    });
  } catch (error) {
    handleDatabaseError(error, res, next);
  }
}

export async function patchDatabaseIsActiveController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      res.status(400).json({
        success: false,
        message: "Invalid id",
      });
      return;
    }

    const database = await patchDatabaseIsActive(
      id,
      req.body?.is_active,
      req.admin?.adminId ?? null
    );

    res.status(200).json({
      success: true,
      data: database,
    });
  } catch (error) {
    handleDatabaseError(error, res, next);
  }
}

export async function softDeleteDatabaseController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      res.status(400).json({
        success: false,
        message: "Invalid id",
      });
      return;
    }

    const database = await softDeleteDatabase(id, req.admin?.adminId ?? null);
    res.status(200).json({
      success: true,
      message: "Database soft deleted",
      data: database,
    });
  } catch (error) {
    handleDatabaseError(error, res, next);
  }
}

export async function hardDeleteDatabaseController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      res.status(400).json({
        success: false,
        message: "Invalid id",
      });
      return;
    }

    const result = await hardDeleteDatabase(id, req.admin?.adminId ?? null);
    res.status(200).json({
      success: true,
      message: "Database hard deleted",
      data: result,
    });
  } catch (error) {
    handleDatabaseError(error, res, next);
  }
}
