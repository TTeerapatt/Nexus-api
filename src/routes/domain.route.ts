import { Router } from "express";
import {
  getDomainByNameController,
  getDomainDnsController,
  getDomainsController,
} from "../controllers/domain.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";

const domainRouter = Router();

domainRouter.get(
  "/",
  authMiddleware,
  requirePermission("domain", "view"),
  getDomainsController
);

domainRouter.get(
  "/:domain/dns",
  authMiddleware,
  requirePermission("domain", "view"),
  getDomainDnsController
);

domainRouter.get(
  "/:domain",
  authMiddleware,
  requirePermission("domain", "view"),
  getDomainByNameController
);

export default domainRouter;
