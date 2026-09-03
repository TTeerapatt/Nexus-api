import { Router } from "express";
import { jenkinsWebhookController } from "../controllers/deploy_events.controller";

const webhookRouter = Router();

webhookRouter.post("/jenkins", jenkinsWebhookController);

export default webhookRouter;
