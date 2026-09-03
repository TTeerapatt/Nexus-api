import type { Request, Response } from "express";
import {
  deployEventHub,
  parseJenkinsWebhookPayload,
  type DeployEvent,
  type JenkinsWebhookPayload,
} from "../services/deploy_events.service";

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value[0] !== undefined ? String(value[0]) : undefined;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

function writeSse(
  res: Response,
  eventName: string,
  payload: unknown
): void {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function jenkinsWebhookController(req: Request, res: Response): void {
  const configuredSecret = (process.env.JENKINS_WEBHOOK_SECRET || "").trim();
  if (!configuredSecret) {
    res.status(503).json({
      success: false,
      message: "JENKINS_WEBHOOK_SECRET is not configured",
    });
    return;
  }

  const providedSecret = String(
    req.headers["x-jenkins-secret"] ||
      req.headers["x-webhook-secret"] ||
      ""
  ).trim();

  if (!providedSecret || providedSecret !== configuredSecret) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  let normalizedBody: JenkinsWebhookPayload;
  try {
    const rawBody = req.body;
    normalizedBody =
      typeof rawBody === "string"
        ? (JSON.parse(rawBody || "{}") as JenkinsWebhookPayload)
        : ((rawBody || {}) as JenkinsWebhookPayload);
  } catch {
    res.status(400).json({
      success: false,
      message: "Invalid JSON payload",
    });
    return;
  }

  const parsed = parseJenkinsWebhookPayload(normalizedBody);

  if ("error" in parsed) {
    res.status(400).json({
      success: false,
      message: parsed.error,
    });
    return;
  }

  deployEventHub.publish(parsed);

  res.status(200).json({
    success: true,
    data: parsed,
  });
}

export function deployStreamController(req: Request, res: Response): void {
  const jobNameRaw = firstQueryValue(req.query.jobName)?.trim() || "";
  const jobName = jobNameRaw ? decodeURIComponent(jobNameRaw) : null;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  // Disable compression buffering on some proxies
  res.flushHeaders?.();

  writeSse(res, "connected", {
    ok: true,
    jobName,
    timestamp: new Date().toISOString(),
  });

  const snapshot = deployEventHub.getLatest(jobName);
  if (snapshot.length > 0) {
    writeSse(res, "snapshot", snapshot);
  }

  const onEvent = (event: DeployEvent) => {
    writeSse(res, "deploy-status", event);
  };

  const unsubscribe = deployEventHub.subscribe(jobName, onEvent);

  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 25_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on("close", cleanup);
  req.on("aborted", cleanup);
}
