import { Router } from "express";
import {
  getAdminLogByIdController,
  getAdminLogsController,
} from "../controllers/admin_log.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";

const adminLogRouter = Router();

// read-only — log ถูกสร้างจากระบบเท่านั้น
adminLogRouter.get(
  "/",
  authMiddleware,
  requirePermission("logs", "view"),
  getAdminLogsController
);
adminLogRouter.get(
  "/:id",
  authMiddleware,
  requirePermission("logs", "view"),
  getAdminLogByIdController
);

export default adminLogRouter;
