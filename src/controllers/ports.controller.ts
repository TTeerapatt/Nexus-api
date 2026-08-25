import type { Request, Response, NextFunction } from "express";
import {
  PortError,
  createPort,
  getActivePortById,
  getActivePorts,
  hardDeletePort,
  patchPortIsActive,
  softDeletePort,
  updatePort,
} from "../services/ports.service";

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
  throw new PortError(400, "is_active must be a boolean");
}

function parseOptionalPortNumberQuery(
  value: string | undefined
): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new PortError(400, "port_number must be an integer between 1 and 65535");
  }
  return port;
}

function handlePortError(
  error: unknown,
  res: Response,
  next: NextFunction
): void {
  if (error instanceof PortError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }
  next(error);
}

export async function getPortsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ports = await getActivePorts({
      is_active: parseOptionalBooleanQuery(firstQueryValue(req.query.is_active)),
      project_name: firstQueryValue(req.query.project_name),
      port_number: parseOptionalPortNumberQuery(
        firstQueryValue(req.query.port_number)
      ),
    });
    res.status(200).json({
      success: true,
      data: ports,
    });
  } catch (error) {
    handlePortError(error, res, next);
  }
}

export async function getPortByIdController(
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

    const port = await getActivePortById(id);
    if (!port) {
      res.status(404).json({
        success: false,
        message: "Port not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: port,
    });
  } catch (error) {
    next(error);
  }
}

export async function createPortController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const port = await createPort({
      port_number: req.body?.port_number,
      project_name: req.body?.project_name,
      description: req.body?.description,
      is_active: req.body?.is_active,
      adminId: req.admin?.adminId ?? null,
    });

    res.status(201).json({
      success: true,
      data: port,
    });
  } catch (error) {
    handlePortError(error, res, next);
  }
}

export async function updatePortController(
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

    const port = await updatePort(id, {
      port_number: req.body?.port_number,
      project_name: req.body?.project_name,
      description: req.body?.description,
      is_active: req.body?.is_active,
      adminId: req.admin?.adminId ?? null,
    });

    res.status(200).json({
      success: true,
      data: port,
    });
  } catch (error) {
    handlePortError(error, res, next);
  }
}

export async function patchPortIsActiveController(
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

    const port = await patchPortIsActive(
      id,
      req.body?.is_active,
      req.admin?.adminId ?? null
    );

    res.status(200).json({
      success: true,
      data: port,
    });
  } catch (error) {
    handlePortError(error, res, next);
  }
}

export async function softDeletePortController(
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

    const port = await softDeletePort(id, req.admin?.adminId ?? null);
    res.status(200).json({
      success: true,
      message: "Port soft deleted",
      data: port,
    });
  } catch (error) {
    handlePortError(error, res, next);
  }
}

export async function hardDeletePortController(
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

    const result = await hardDeletePort(id, req.admin?.adminId ?? null);
    res.status(200).json({
      success: true,
      message: "Port hard deleted",
      data: result,
    });
  } catch (error) {
    handlePortError(error, res, next);
  }
}
