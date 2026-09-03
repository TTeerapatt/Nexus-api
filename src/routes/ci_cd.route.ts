import { Router } from "express";
import {
  getCiCdBuildStagesController,
  getCiCdJobByNameController,
  getCiCdJobsController,
  getCiCdStageLogController,
} from "../controllers/ci_cd.controller";
import { deployStreamController } from "../controllers/deploy_events.controller";
import {
  authMiddleware,
  authMiddlewareAllowQueryToken,
} from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";

const ciCdRouter = Router();

ciCdRouter.get(
  "/stream-status",
  authMiddlewareAllowQueryToken,
  requirePermission("ci-cd", "view"),
  deployStreamController
);

ciCdRouter.get(
  "/jobs",
  authMiddleware,
  requirePermission("ci-cd", "view"),
  getCiCdJobsController
);

ciCdRouter.get(
  "/jobs/:jobName/builds/:buildNumber/stages/:stageId/log",
  authMiddleware,
  requirePermission("ci-cd", "view"),
  getCiCdStageLogController
);

ciCdRouter.get(
  "/jobs/:jobName/builds/:buildNumber",
  authMiddleware,
  requirePermission("ci-cd", "view"),
  getCiCdBuildStagesController
);

ciCdRouter.get(
  "/jobs/:jobName",
  authMiddleware,
  requirePermission("ci-cd", "view"),
  getCiCdJobByNameController
);

export default ciCdRouter;
