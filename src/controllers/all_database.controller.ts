import type { Request, Response, NextFunction } from "express";
import { getAllDatabases } from "../services/all_database.service";

export async function getAllDatabasesController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const databases = await getAllDatabases();
    res.status(200).json({
      success: true,
      data: databases,
    });
  } catch (error) {
    next(error);
  }
}
