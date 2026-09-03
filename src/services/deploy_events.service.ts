import { EventEmitter } from "events";
import type { JenkinsJobStatus } from "./ci_cd.service";

export type DeployPhase = "started" | "stage" | "finished";
export type DeployWebhookStatus = "in_progress" | "success" | "failed";

export type DeployEvent = {
  jobName: string;
  buildNumber: number;
  phase: DeployPhase;
  status: DeployWebhookStatus;
  /** Mapped status used by the existing CI/CD UI */
  jobStatus: JenkinsJobStatus;
  /** Jenkins-style color so list cards stay consistent */
  color: string;
  stage?: string;
  message?: string;
  timestamp: string;
};

export type JenkinsWebhookPayload = {
  jobName?: unknown;
  name?: unknown;
  job?: unknown;
  buildNumber?: unknown;
  number?: unknown;
  build?: unknown;
  phase?: unknown;
  status?: unknown;
  result?: unknown;
  stage?: unknown;
  message?: unknown;
};

const CHANNEL_ALL = "deploy";

function asTrimmedString(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function parseBuildNumber(value: unknown): number | null {
  const raw = asTrimmedString(value);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizePhase(value: unknown): DeployPhase {
  const phase = asTrimmedString(value).toLowerCase();
  if (phase === "started" || phase === "start") return "started";
  if (phase === "finished" || phase === "finish" || phase === "done") {
    return "finished";
  }
  return "stage";
}

function normalizeWebhookStatus(
  statusRaw: unknown,
  resultRaw: unknown,
  phase: DeployPhase
): DeployWebhookStatus | null {
  const status = asTrimmedString(statusRaw).toLowerCase().replace(/[\s-]+/g, "_");
  const result = asTrimmedString(resultRaw).toUpperCase();

  if (
    status === "in_progress" ||
    status === "running" ||
    status === "building" ||
    status === "progress"
  ) {
    return "in_progress";
  }
  if (status === "success" || status === "successful" || status === "ok") {
    return "success";
  }
  if (
    status === "failed" ||
    status === "failure" ||
    status === "error" ||
    status === "fail"
  ) {
    return "failed";
  }

  if (result === "SUCCESS") return "success";
  if (result === "FAILURE" || result === "FAILED" || result === "ERROR") {
    return "failed";
  }

  if (phase === "started" || phase === "stage") return "in_progress";
  return null;
}

export function mapDeployStatusToJobStatus(
  status: DeployWebhookStatus
): JenkinsJobStatus {
  if (status === "in_progress") return "running";
  if (status === "success") return "success";
  return "failed";
}

export function mapDeployStatusToColor(status: DeployWebhookStatus): string {
  if (status === "in_progress") return "blue_anime";
  if (status === "success") return "blue";
  return "red";
}

export function parseJenkinsWebhookPayload(
  body: JenkinsWebhookPayload
): DeployEvent | { error: string } {
  const jobName =
    asTrimmedString(body.jobName) ||
    asTrimmedString(body.name) ||
    asTrimmedString(body.job);

  if (!jobName) {
    return { error: "jobName is required" };
  }

  const buildNumber =
    parseBuildNumber(body.buildNumber) ??
    parseBuildNumber(body.number) ??
    parseBuildNumber(body.build);

  if (buildNumber == null) {
    return { error: "buildNumber must be a positive integer" };
  }

  const phase = normalizePhase(body.phase);
  const status = normalizeWebhookStatus(body.status, body.result, phase);
  if (!status) {
    return {
      error: "status must be one of: in_progress, success, failed",
    };
  }

  const stage = asTrimmedString(body.stage) || undefined;
  const message = asTrimmedString(body.message) || undefined;

  return {
    jobName,
    buildNumber,
    phase,
    status,
    jobStatus: mapDeployStatusToJobStatus(status),
    color: mapDeployStatusToColor(status),
    ...(stage ? { stage } : {}),
    ...(message ? { message } : {}),
    timestamp: new Date().toISOString(),
  };
}

class DeployEventHub {
  private emitter = new EventEmitter();
  /** Latest event per job — sent as snapshot to new SSE clients */
  private latestByJob = new Map<string, DeployEvent>();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  publish(event: DeployEvent): void {
    this.latestByJob.set(event.jobName, event);
    this.emitter.emit(CHANNEL_ALL, event);
    this.emitter.emit(jobChannel(event.jobName), event);
  }

  getLatest(jobName?: string | null): DeployEvent[] {
    if (jobName) {
      const event = this.latestByJob.get(jobName);
      return event ? [event] : [];
    }
    return Array.from(this.latestByJob.values()).sort((a, b) =>
      a.jobName.localeCompare(b.jobName)
    );
  }

  subscribe(
    jobName: string | null,
    listener: (event: DeployEvent) => void
  ): () => void {
    const channel = jobName ? jobChannel(jobName) : CHANNEL_ALL;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }
}

function jobChannel(jobName: string): string {
  return `deploy:${jobName}`;
}

export const deployEventHub = new DeployEventHub();
