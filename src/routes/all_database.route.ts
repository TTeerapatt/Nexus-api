import { Router } from "express";
import { getAllDatabasesController } from "../controllers/all_database.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireAnyPermission } from "../middleware/permission.middleware";

const allDatabaseRouter = Router();

allDatabaseRouter.get(
  "/",
  authMiddleware,
  requireAnyPermission([
    { tabCode: "database", actionCode: "view" },
    { tabCode: "database", actionCode: "add" },
    { tabCode: "database", actionCode: "edit" },
  ]),
  getAllDatabasesController
);

export default allDatabaseRouter;
