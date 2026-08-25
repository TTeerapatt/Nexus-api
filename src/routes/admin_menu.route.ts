import { Router } from "express";
import {
  getAdminMenuAllController,
  getAdminMenuLabelsController,
  getAdminMenuTabsController,
} from "../controllers/admin_menu.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const adminMenuRouter = Router();

adminMenuRouter.get("/", authMiddleware, getAdminMenuAllController);
adminMenuRouter.get("/labels", authMiddleware, getAdminMenuLabelsController);
adminMenuRouter.get("/tabs", authMiddleware, getAdminMenuTabsController);

export default adminMenuRouter;
