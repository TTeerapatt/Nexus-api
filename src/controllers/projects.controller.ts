import type { Request, Response, NextFunction } from "express";
import {
  ProjectError,
  createProject,
  getActiveProjectById,
  getActiveProjects,
  hardDeleteProject,
  patchProjectIsActive,
  softDeleteProject,
  updateProject,
} from "../services/projects.service";

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
  throw new ProjectError(400, "is_active must be a boolean");
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
    throw new ProjectError(400, `${field} is invalid`);
  }
  return id;
}

function handleProjectError(
  error: unknown,
  res: Response,
  next: NextFunction
): void {
  if (error instanceof ProjectError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }
  next(error);
}

export async function getProjectsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const projects = await getActiveProjects({
      is_active: parseOptionalBooleanQuery(firstQueryValue(req.query.is_active)),
      name: firstQueryValue(req.query.name),
      type: firstQueryValue(req.query.type),
      resource_type_id: parseOptionalPositiveIntQuery(
        firstQueryValue(req.query.resource_type_id),
        "resource_type_id"
      ),
      resource_type_code: firstQueryValue(req.query.resource_type_code),
    });
    res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error) {
    handleProjectError(error, res, next);
  }
}

export async function getProjectByIdController(
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

    const project = await getActiveProjectById(id);
    if (!project) {
      res.status(404).json({
        success: false,
        message: "Project not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
}

export async function createProjectController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const project = await createProject({
      name: req.body?.name,
      description: req.body?.description,
      type: req.body?.type,
      resource_type_id: req.body?.resource_type_id,
      is_active: req.body?.is_active,
      adminId: req.admin?.adminId ?? null,
    });

    res.status(201).json({
      success: true,
      data: project,
    });
  } catch (error) {
    handleProjectError(error, res, next);
  }
}

export async function updateProjectController(
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

    const project = await updateProject(id, {
      name: req.body?.name,
      description: req.body?.description,
      type: req.body?.type,
      resource_type_id: req.body?.resource_type_id,
      is_active: req.body?.is_active,
      adminId: req.admin?.adminId ?? null,
    });

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    handleProjectError(error, res, next);
  }
}

export async function patchProjectIsActiveController(
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

    const project = await patchProjectIsActive(
      id,
      req.body?.is_active,
      req.admin?.adminId ?? null
    );

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error) {
    handleProjectError(error, res, next);
  }
}

export async function softDeleteProjectController(
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

    const project = await softDeleteProject(id, req.admin?.adminId ?? null);
    res.status(200).json({
      success: true,
      message: "Project soft deleted",
      data: project,
    });
  } catch (error) {
    handleProjectError(error, res, next);
  }
}

export async function hardDeleteProjectController(
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

    const result = await hardDeleteProject(id, req.admin?.adminId ?? null);
    res.status(200).json({
      success: true,
      message: "Project hard deleted",
      data: result,
    });
  } catch (error) {
    handleProjectError(error, res, next);
  }
}
