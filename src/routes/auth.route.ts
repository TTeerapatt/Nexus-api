import { Router } from "express";
import {
  createAdminController,
  getMeController,
  loginAdminController,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const authRouter = Router();

authRouter.post("/register", createAdminController);
authRouter.post("/login", loginAdminController);
authRouter.get("/me", authMiddleware, getMeController);

export default authRouter;
