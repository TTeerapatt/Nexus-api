import { Router } from "express";
import {
  createAdminController,
  getAdminByIdController,
  getAdminsController,
  getAdminPermissionsByIdController,
  hardDeleteAdminController,
  softDeleteAdminController,
  updateAdminController,
} from "../controllers/admins.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  requirePermission,
  requireSelfOrPermission,
} from "../middleware/permission.middleware";

const adminsRouter = Router();

adminsRouter.post(
  "/",
  authMiddleware,
  requirePermission("admins", "add"),
  createAdminController
);
adminsRouter.get(
  "/",
  authMiddleware,
  requirePermission("admins", "view"),
  getAdminsController
);
adminsRouter.get(
  "/:id/permissions",
  authMiddleware,
  requirePermission("admins", "view"),
  getAdminPermissionsByIdController
);
adminsRouter.get(
  "/:id",
  authMiddleware,
  requireSelfOrPermission("admins", "view"),
  getAdminByIdController
);
adminsRouter.put(
  "/:id",
  authMiddleware,
  requirePermission("admins", "edit"),
  updateAdminController
);
adminsRouter.delete(
  "/:id/hard",
  authMiddleware,
  requirePermission("admins", "delete"),
  hardDeleteAdminController
);
adminsRouter.delete(
  "/:id",
  authMiddleware,
  requirePermission("admins", "delete"),
  softDeleteAdminController
);

export default adminsRouter;
