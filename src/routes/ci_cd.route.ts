import { Router } from "express";
import {
  getCiCdJobByNameController,
  getCiCdJobsController,
} from "../controllers/ci_cd.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";

const ciCdRouter = Router();

ciCdRouter.get(
  "/jobs",
  authMiddleware,
  requirePermission("ci-cd", "view"),
  getCiCdJobsController
);

ciCdRouter.get(
  "/jobs/:jobName",
  authMiddleware,
  requirePermission("ci-cd", "view"),
  getCiCdJobByNameController
);

export default ciCdRouter;
