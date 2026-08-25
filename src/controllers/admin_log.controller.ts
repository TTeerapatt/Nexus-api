import type { Request, Response, NextFunction } from "express";
import {
  AdminLogError,
  getActiveAdminLogById,
  getActiveAdminLogs,
} from "../services/admin_log.service";

function parseIdParam(value: string): number | null {
  const id = Number(value);
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

function parseOptionalPositiveInt(
  value: string | undefined
): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AdminLogError(400, "Invalid id filter");
  }
  return id;
}

function handleAdminLogError(
  error: unknown,
  res: Response,
  next: NextFunction
): void {
  if (error instanceof AdminLogError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }
  next(error);
}

export async function getAdminLogsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const logs = await getActiveAdminLogs({
      admin_id: parseOptionalPositiveInt(firstQueryValue(req.query.admin_id)),
      action: firstQueryValue(req.query.action),
      entity_type: firstQueryValue(req.query.entity_type),
      entity_id: parseOptionalPositiveInt(firstQueryValue(req.query.entity_id)),
      date_from: firstQueryValue(req.query.date_from),
      date_to: firstQueryValue(req.query.date_to),
    });
    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error) {
    handleAdminLogError(error, res, next);
  }
}

export async function getAdminLogByIdController(
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

    const log = await getActiveAdminLogById(id);
    if (!log) {
      res.status(404).json({
        success: false,
        message: "Admin log not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: log,
    });
  } catch (error) {
    next(error);
  }
}
