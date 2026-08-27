import { Router } from "express";
import {
  getVpsByIdController,
  getVpsListController,
  getVpsMetricsController,
  postVpsPowerActionController,
} from "../controllers/vps.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";

const vpsRouter = Router();

vpsRouter.get(
  "/",
  authMiddleware,
  requirePermission("vps", "view"),
  getVpsListController
);

vpsRouter.get(
  "/:id/metrics",
  authMiddleware,
  requirePermission("vps", "view"),
  getVpsMetricsController
);

vpsRouter.post(
  "/:id/start",
  authMiddleware,
  requirePermission("vps", "edit"),
  postVpsPowerActionController
);

vpsRouter.post(
  "/:id/stop",
  authMiddleware,
  requirePermission("vps", "edit"),
  postVpsPowerActionController
);

vpsRouter.post(
  "/:id/restart",
  authMiddleware,
  requirePermission("vps", "edit"),
  postVpsPowerActionController
);

vpsRouter.get(
  "/:id",
  authMiddleware,
  requirePermission("vps", "view"),
  getVpsByIdController
);

export default vpsRouter;
