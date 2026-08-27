import type { Request, Response, NextFunction } from "express";
import {
  DomainError,
  getDomainByName,
  getDomainDnsRecords,
  listDomains,
} from "../services/domain.service";

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function handleDomainError(
  error: unknown,
  res: Response,
  next: NextFunction
): void {
  if (error instanceof DomainError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }
  next(error);
}

export async function getDomainsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await listDomains();
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    handleDomainError(error, res, next);
  }
}

export async function getDomainByNameController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const domain = decodeURIComponent(routeParam(req.params.domain)).trim();
    if (!domain) {
      res.status(400).json({
        success: false,
        message: "domain is required",
      });
      return;
    }

    const data = await getDomainByName(domain);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    handleDomainError(error, res, next);
  }
}

export async function getDomainDnsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const domain = decodeURIComponent(routeParam(req.params.domain)).trim();
    if (!domain) {
      res.status(400).json({
        success: false,
        message: "domain is required",
      });
      return;
    }

    const data = await getDomainDnsRecords(domain);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    handleDomainError(error, res, next);
  }
}
