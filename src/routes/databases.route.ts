import { Router } from "express";
import {
  createDatabaseController,
  getDatabaseByIdController,
  getDatabasesController,
  hardDeleteDatabaseController,
  patchDatabaseIsActiveController,
  softDeleteDatabaseController,
  updateDatabaseController,
} from "../controllers/databases.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";

const databasesRouter = Router();

databasesRouter.get(
  "/",
  authMiddleware,
  requirePermission("database", "view"),
  getDatabasesController
);
databasesRouter.get(
  "/:id",
  authMiddleware,
  requirePermission("database", "view"),
  getDatabaseByIdController
);
databasesRouter.post(
  "/",
  authMiddleware,
  requirePermission("database", "add"),
  createDatabaseController
);
databasesRouter.put(
  "/:id",
  authMiddleware,
  requirePermission("database", "edit"),
  updateDatabaseController
);
databasesRouter.patch(
  "/:id/is-active",
  authMiddleware,
  requirePermission("database", "edit"),
  patchDatabaseIsActiveController
);
databasesRouter.delete(
  "/:id/hard",
  authMiddleware,
  requirePermission("database", "delete"),
  hardDeleteDatabaseController
);
databasesRouter.delete(
  "/:id",
  authMiddleware,
  requirePermission("database", "delete"),
  softDeleteDatabaseController
);

export default databasesRouter;
