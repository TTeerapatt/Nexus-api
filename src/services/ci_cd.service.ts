export class CiCdError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "CiCdError";
    this.statusCode = statusCode;
  }
}

export type JenkinsJobStatus =
  | "success"
  | "failed"
  | "unstable"
  | "running"
  | "aborted"
  | "not_built"
  | "disabled"
  | "unknown";

export type CiCdJobListItem = {
  name: string;
  url: string;
  color: string;
  status: JenkinsJobStatus;
};

export type CiCdStageItem = {
  name: string;
  status: string;
  durationMillis: number | null;
};

export type CiCdJobDetail = {
  name: string;
  url: string;
  color: string;
  status: JenkinsJobStatus;
  healthScore: number | null;
  lastBuildNumber: number | null;
  stages: CiCdStageItem[];
  stagesMessage?: string;
};

type JenkinsJobSummary = {
  name?: string;
  url?: string;
  color?: string;
};

type JenkinsRootResponse = {
  jobs?: JenkinsJobSummary[];
};

type JenkinsJobDetailResponse = {
  name?: string;
  url?: string;
  color?: string;
  healthReport?: Array<{ score?: number }>;
  lastBuild?: { number?: number; url?: string } | null;
};

type JenkinsWfapiStage = {
  name?: string;
  status?: string;
  durationMillis?: number;
};

type JenkinsWfapiDescribe = {
  stages?: JenkinsWfapiStage[];
};

function getJenkinsConfig() {
  const baseUrl = (process.env.JENKINS_BASE_URL || "").trim().replace(/\/+$/, "");
  const user = (process.env.JENKINS_USER || "").trim();
  const token = (process.env.JENKINS_API_TOKEN || "").trim();

  if (!baseUrl) {
    throw new CiCdError(500, "JENKINS_BASE_URL is not configured");
  }
  if (!user || !token) {
    throw new CiCdError(500, "JENKINS_USER / JENKINS_API_TOKEN is not configured");
  }

  return { baseUrl, user, token };
}

function jenkinsAuthHeader(user: string, token: string): string {
  return `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`;
}

export function mapJenkinsColorToStatus(color: string | undefined): JenkinsJobStatus {
  const value = String(color || "").trim().toLowerCase();
  if (!value) return "unknown";

  if (value.endsWith("_anime")) return "running";
  if (value === "blue" || value === "green") return "success";
  if (value === "red") return "failed";
  if (value === "yellow") return "unstable";
  if (value === "aborted") return "aborted";
  if (value === "disabled") return "disabled";
  if (value === "notbuilt" || value === "grey" || value === "nobuilt") {
    return "not_built";
  }
  return "unknown";
}

async function jenkinsFetch<T>(path: string): Promise<T> {
  const { baseUrl, user, token } = getJenkinsConfig();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: jenkinsAuthHeader(user, token),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to reach Jenkins";
    throw new CiCdError(502, `Jenkins request failed: ${message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new CiCdError(502, "Jenkins authentication failed");
  }

  if (response.status === 404) {
    throw new CiCdError(404, "Jenkins job not found");
  }

  if (!response.ok) {
    throw new CiCdError(
      502,
      `Jenkins responded with HTTP ${response.status}`
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new CiCdError(502, "Jenkins returned invalid JSON");
  }
}

export async function listCiCdJobs(): Promise<CiCdJobListItem[]> {
  const root = await jenkinsFetch<JenkinsRootResponse>("/api/json");
  const jobs = Array.isArray(root.jobs) ? root.jobs : [];

  return jobs
    .filter((job) => typeof job?.name === "string" && job.name.trim() !== "")
    .map((job) => {
      const name = String(job.name).trim();
      const color = String(job.color || "").trim();
      return {
        name,
        url: String(job.url || "").trim(),
        color,
        status: mapJenkinsColorToStatus(color),
      };
    });
}

export async function getCiCdJobDetail(jobName: string): Promise<CiCdJobDetail> {
  const encodedName = encodeURIComponent(jobName);

  const job = await jenkinsFetch<JenkinsJobDetailResponse>(
    `/job/${encodedName}/api/json`
  );

  const name = String(job.name || jobName).trim();
  const color = String(job.color || "").trim();
  const healthScore =
    Array.isArray(job.healthReport) && job.healthReport[0]?.score != null
      ? Number(job.healthReport[0].score)
      : null;
  const lastBuildNumber =
    job.lastBuild?.number != null ? Number(job.lastBuild.number) : null;

  let stages: CiCdStageItem[] = [];
  let stagesMessage: string | undefined;

  if (lastBuildNumber == null) {
    stagesMessage = "No builds available for this job";
  } else {
    try {
      const describe = await jenkinsFetch<JenkinsWfapiDescribe>(
        `/job/${encodedName}/${lastBuildNumber}/wfapi/describe`
      );
      const rawStages = Array.isArray(describe.stages) ? describe.stages : [];
      stages = rawStages
        .filter((stage) => typeof stage?.name === "string" && stage.name.trim())
        .map((stage) => ({
          name: String(stage.name).trim(),
          status: String(stage.status || "UNKNOWN").trim().toUpperCase(),
          durationMillis:
            typeof stage.durationMillis === "number"
              ? stage.durationMillis
              : null,
        }));

      if (stages.length === 0) {
        stagesMessage = "No pipeline stages found for the last build";
      }
    } catch (error) {
      if (error instanceof CiCdError && error.statusCode === 404) {
        stagesMessage = "Pipeline stages API is not available for this build";
      } else {
        stagesMessage =
          error instanceof Error
            ? error.message
            : "Unable to load pipeline stages";
      }
      stages = [];
    }
  }

  return {
    name,
    url: String(job.url || "").trim(),
    color,
    status: mapJenkinsColorToStatus(color),
    healthScore: Number.isFinite(healthScore as number) ? healthScore : null,
    lastBuildNumber: Number.isFinite(lastBuildNumber as number)
      ? lastBuildNumber
      : null,
    stages,
    ...(stagesMessage ? { stagesMessage } : {}),
  };
}
