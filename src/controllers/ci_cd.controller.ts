import type { Request, Response, NextFunction } from "express";
import {
  CiCdError,
  getCiCdJobDetail,
  listCiCdJobs,
} from "../services/ci_cd.service";

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function handleCiCdError(
  error: unknown,
  res: Response,
  next: NextFunction
): void {
  if (error instanceof CiCdError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }
  next(error);
}

export async function getCiCdJobsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await listCiCdJobs();
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    handleCiCdError(error, res, next);
  }
}

export async function getCiCdJobByNameController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const jobName = decodeURIComponent(routeParam(req.params.jobName)).trim();
    if (!jobName) {
      res.status(400).json({
        success: false,
        message: "jobName is required",
      });
      return;
    }

    const data = await getCiCdJobDetail(jobName);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    handleCiCdError(error, res, next);
  }
}
