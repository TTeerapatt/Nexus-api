import type { Request, Response, NextFunction } from "express";
import {
  CiCdError,
  getCiCdBuildStages,
  getCiCdJobDetail,
  listCiCdJobs,
} from "../services/ci_cd.service";

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

    const buildQuery = firstQueryValue(req.query.buildNumber);
    let buildNumber: number | undefined;
    if (buildQuery != null && buildQuery.trim() !== "") {
      const parsed = Number(buildQuery);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        res.status(400).json({
          success: false,
          message: "buildNumber must be a positive integer",
        });
        return;
      }
      buildNumber = parsed;
    }

    const data = await getCiCdJobDetail(jobName, buildNumber);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    handleCiCdError(error, res, next);
  }
}

export async function getCiCdBuildStagesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const jobName = decodeURIComponent(routeParam(req.params.jobName)).trim();
    const buildNumber = Number(routeParam(req.params.buildNumber));

    if (!jobName) {
      res.status(400).json({
        success: false,
        message: "jobName is required",
      });
      return;
    }

    if (!Number.isInteger(buildNumber) || buildNumber <= 0) {
      res.status(400).json({
        success: false,
        message: "buildNumber must be a positive integer",
      });
      return;
    }

    const data = await getCiCdBuildStages(jobName, buildNumber);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    handleCiCdError(error, res, next);
  }
}
