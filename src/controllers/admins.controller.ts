import type { Request, Response, NextFunction } from "express";
import {
  AdminError,
  createAdminByAdmin,
  getActiveAdminById,
  getActiveAdmins,
  getAdminPermissionsById,
  hardDeleteAdmin,
  softDeleteAdmin,
  updateAdmin,
} from "../services/admins.service";

function parseIdParam(value: string): number | null {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

function handleAdminError(
  error: unknown,
  res: Response,
  next: NextFunction
): void {
  if (error instanceof AdminError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }
  next(error);
}

export async function getAdminsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admins = await getActiveAdmins();
    res.status(200).json({
      success: true,
      data: admins,
    });
  } catch (error) {
    next(error);
  }
}

export async function createAdminController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = await createAdminByAdmin({
      email: req.body?.email,
      password: req.body?.password,
      display_name: req.body?.display_name,
      role: req.body?.role,
      permissions: req.body?.permissions,
      adminId: req.admin?.adminId ?? null,
    });

    res.status(201).json({
      success: true,
      data: admin,
    });
  } catch (error) {
    handleAdminError(error, res, next);
  }
}

export async function getAdminByIdController(
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

    const admin = await getActiveAdminById(id);
    if (!admin) {
      res.status(404).json({
        success: false,
        message: "Admin not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: admin,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAdminController(
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

    const admin = await updateAdmin(id, {
      email: req.body?.email,
      display_name: req.body?.display_name,
      role: req.body?.role,
      password: req.body?.password,
      permissions: req.body?.permissions,
      adminId: req.admin?.adminId ?? null,
    });

    res.status(200).json({
      success: true,
      data: admin,
    });
  } catch (error) {
    handleAdminError(error, res, next);
  }
}

export async function getAdminPermissionsByIdController(
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

    const data = await getAdminPermissionsById(id);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    handleAdminError(error, res, next);
  }
}

export async function softDeleteAdminController(
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

    const admin = await softDeleteAdmin(id, req.admin?.adminId ?? null);
    res.status(200).json({
      success: true,
      message: "Admin soft deleted",
      data: admin,
    });
  } catch (error) {
    handleAdminError(error, res, next);
  }
}

export async function hardDeleteAdminController(
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

    const result = await hardDeleteAdmin(id, req.admin?.adminId ?? null);
    res.status(200).json({
      success: true,
      message: "Admin hard deleted",
      data: result,
    });
  } catch (error) {
    handleAdminError(error, res, next);
  }
}
