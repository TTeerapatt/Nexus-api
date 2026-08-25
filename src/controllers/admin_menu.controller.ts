import type { NextFunction, Request, Response } from "express";
import {
  getAdminMenuAll,
  getAdminMenuLabels,
  getAdminMenuTabs,
} from "../services/admin_menu.service";

export async function getAdminMenuAllController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const menu = await getAdminMenuAll();
    res.status(200).json({
      success: true,
      data: menu,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminMenuLabelsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const labels = await getAdminMenuLabels();
    res.status(200).json({
      success: true,
      data: labels,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminMenuTabsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tabs = await getAdminMenuTabs();
    res.status(200).json({
      success: true,
      data: tabs,
    });
  } catch (error) {
    next(error);
  }
}
