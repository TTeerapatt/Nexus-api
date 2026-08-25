import { Router } from "express";
import {
  createPortController,
  getPortByIdController,
  getPortsController,
  hardDeletePortController,
  patchPortIsActiveController,
  softDeletePortController,
  updatePortController,
} from "../controllers/ports.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";

const portsRouter = Router();

portsRouter.get(
  "/",
  authMiddleware,
  requirePermission("port", "view"),
  getPortsController
);
portsRouter.get(
  "/:id",
  authMiddleware,
  requirePermission("port", "view"),
  getPortByIdController
);
portsRouter.post(
  "/",
  authMiddleware,
  requirePermission("port", "add"),
  createPortController
);
portsRouter.put(
  "/:id",
  authMiddleware,
  requirePermission("port", "edit"),
  updatePortController
);
portsRouter.patch(
  "/:id/is-active",
  authMiddleware,
  requirePermission("port", "edit"),
  patchPortIsActiveController
);
portsRouter.delete(
  "/:id/hard",
  authMiddleware,
  requirePermission("port", "delete"),
  hardDeletePortController
);
portsRouter.delete(
  "/:id",
  authMiddleware,
  requirePermission("port", "delete"),
  softDeletePortController
);

export default portsRouter;
