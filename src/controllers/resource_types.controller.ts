import type { Request, Response, NextFunction } from "express";
import { getActiveResourceTypes } from "../services/resource_types.service";

export async function getResourceTypesController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const types = await getActiveResourceTypes();
    res.status(200).json({
      success: true,
      data: types,
    });
  } catch (error) {
    next(error);
  }
}
