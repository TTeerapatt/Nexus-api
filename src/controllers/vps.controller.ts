import type { Request, Response, NextFunction } from "express";
import {
  VpsError,
  getVirtualMachineById,
  getVirtualMachineMetrics,
  listVirtualMachines,
  runVirtualMachinePowerAction,
  type VpsPowerAction,
} from "../services/vps.service";

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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

function handleVpsError(
  error: unknown,
  res: Response,
  next: NextFunction
): void {
  if (error instanceof VpsError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }
  next(error);
}

export async function getVpsListController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await listVirtualMachines();
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    handleVpsError(error, res, next);
  }
}

export async function getVpsByIdController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getVirtualMachineById(routeParam(req.params.id));
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    handleVpsError(error, res, next);
  }
}

export async function getVpsMetricsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getVirtualMachineMetrics(
      routeParam(req.params.id),
      firstQueryValue(req.query.date_from) ||
        firstQueryValue(req.query.dateFrom),
      firstQueryValue(req.query.date_to) || firstQueryValue(req.query.dateTo)
    );
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    handleVpsError(error, res, next);
  }
}

export async function postVpsPowerActionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const fromParam = routeParam(req.params.action).trim().toLowerCase();
    const fromPath = String(req.path || "")
      .split("/")
      .filter(Boolean)
      .pop()
      ?.toLowerCase();
    const action = (fromParam || fromPath || "") as VpsPowerAction;

    const data = await runVirtualMachinePowerAction(
      routeParam(req.params.id),
      action
    );
    res.status(200).json({
      success: true,
      data,
      message: `VPS ${action} requested`,
    });
  } catch (error) {
    handleVpsError(error, res, next);
  }
}
