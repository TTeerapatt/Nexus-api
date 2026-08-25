import { Router } from "express";
import { getResourceTypesController } from "../controllers/resource_types.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";

const resourceTypesRouter = Router();

resourceTypesRouter.get(
  "/",
  authMiddleware,
  getResourceTypesController
);

export default resourceTypesRouter;
