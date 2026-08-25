import { Router } from "express";
import {
  createProjectController,
  getProjectByIdController,
  getProjectsController,
  hardDeleteProjectController,
  patchProjectIsActiveController,
  softDeleteProjectController,
  updateProjectController,
} from "../controllers/projects.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  requireAnyPermission,
  requirePermission,
} from "../middleware/permission.middleware";

const projectsRouter = Router();

projectsRouter.get(
  "/",
  authMiddleware,
  requireAnyPermission([
    { tabCode: "projects", actionCode: "view" },
    { tabCode: "port", actionCode: "view" },
    { tabCode: "port", actionCode: "add" },
    { tabCode: "port", actionCode: "edit" },
  ]),
  getProjectsController
);
projectsRouter.get(
  "/:id",
  authMiddleware,
  requirePermission("projects", "view"),
  getProjectByIdController
);
projectsRouter.post(
  "/",
  authMiddleware,
  requirePermission("projects", "add"),
  createProjectController
);
projectsRouter.put(
  "/:id",
  authMiddleware,
  requirePermission("projects", "edit"),
  updateProjectController
);
projectsRouter.patch(
  "/:id/is-active",
  authMiddleware,
  requirePermission("projects", "edit"),
  patchProjectIsActiveController
);
projectsRouter.delete(
  "/:id/hard",
  authMiddleware,
  requirePermission("projects", "delete"),
  hardDeleteProjectController
);
projectsRouter.delete(
  "/:id",
  authMiddleware,
  requirePermission("projects", "delete"),
  softDeleteProjectController
);

export default projectsRouter;
