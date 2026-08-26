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

export type CiCdBuildItem = {
  number: number;
  url: string;
  result: string | null;
  status: JenkinsJobStatus;
  building: boolean;
};

export type CiCdJobDetail = {
  name: string;
  url: string;
  color: string;
  status: JenkinsJobStatus;
  healthScore: number | null;
  lastBuildNumber: number | null;
  selectedBuildNumber: number | null;
  builds: CiCdBuildItem[];
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

type JenkinsBuildSummary = {
  number?: number;
  url?: string;
  result?: string | null;
  building?: boolean;
};

type JenkinsJobDetailResponse = {
  name?: string;
  url?: string;
  color?: string;
  healthReport?: Array<{ score?: number }>;
  lastBuild?: { number?: number; url?: string } | null;
  builds?: JenkinsBuildSummary[];
};

type JenkinsWfapiStage = {
  name?: string;
  status?: string;
  durationMillis?: number;
};

type JenkinsWfapiDescribe = {
  stages?: JenkinsWfapiStage[];
};

const MAX_BUILDS = 10;

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

export function mapJenkinsBuildResultToStatus(
  result: string | null | undefined,
  building?: boolean
): JenkinsJobStatus {
  if (building) return "running";
  const value = String(result || "").trim().toUpperCase();
  if (value === "SUCCESS") return "success";
  if (value === "FAILURE" || value === "FAILED" || value === "ERROR") {
    return "failed";
  }
  if (value === "UNSTABLE") return "unstable";
  if (value === "ABORTED") return "aborted";
  if (value === "NOT_BUILT") return "not_built";
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
    throw new CiCdError(404, "Jenkins resource not found");
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

function mapStages(describe: JenkinsWfapiDescribe): CiCdStageItem[] {
  const rawStages = Array.isArray(describe.stages) ? describe.stages : [];
  return rawStages
    .filter((stage) => typeof stage?.name === "string" && stage.name.trim())
    .map((stage) => ({
      name: String(stage.name).trim(),
      status: String(stage.status || "UNKNOWN").trim().toUpperCase(),
      durationMillis:
        typeof stage.durationMillis === "number" ? stage.durationMillis : null,
    }));
}

async function loadStagesForBuild(
  encodedName: string,
  buildNumber: number
): Promise<{ stages: CiCdStageItem[]; stagesMessage?: string }> {
  try {
    const describe = await jenkinsFetch<JenkinsWfapiDescribe>(
      `/job/${encodedName}/${buildNumber}/wfapi/describe`
    );
    const stages = mapStages(describe);
    if (stages.length === 0) {
      return {
        stages: [],
        stagesMessage: "No pipeline stages found for this build",
      };
    }
    return { stages };
  } catch (error) {
    if (error instanceof CiCdError && error.statusCode === 404) {
      return {
        stages: [],
        stagesMessage: "Pipeline stages API is not available for this build",
      };
    }
    return {
      stages: [],
      stagesMessage:
        error instanceof Error
          ? error.message
          : "Unable to load pipeline stages",
    };
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

export async function getCiCdJobDetail(
  jobName: string,
  buildNumber?: number
): Promise<CiCdJobDetail> {
  const encodedName = encodeURIComponent(jobName);
  const tree =
    "name,url,color,healthReport[score],lastBuild[number],builds[number,url,result,building]";

  const job = await jenkinsFetch<JenkinsJobDetailResponse>(
    `/job/${encodedName}/api/json?tree=${encodeURIComponent(tree)}`
  );

  const name = String(job.name || jobName).trim();
  const color = String(job.color || "").trim();
  const healthScore =
    Array.isArray(job.healthReport) && job.healthReport[0]?.score != null
      ? Number(job.healthReport[0].score)
      : null;
  const lastBuildNumber =
    job.lastBuild?.number != null ? Number(job.lastBuild.number) : null;

  const builds: CiCdBuildItem[] = (Array.isArray(job.builds) ? job.builds : [])
    .filter((build) => typeof build?.number === "number")
    .slice(0, MAX_BUILDS)
    .map((build) => {
      const number = Number(build.number);
      const building = Boolean(build.building);
      const result =
        build.result == null || build.result === ""
          ? null
          : String(build.result);
      return {
        number,
        url: String(build.url || "").trim(),
        result,
        building,
        status: mapJenkinsBuildResultToStatus(result, building),
      };
    });

  const selectedBuildNumber =
    buildNumber != null && Number.isInteger(buildNumber) && buildNumber > 0
      ? buildNumber
      : lastBuildNumber;

  let stages: CiCdStageItem[] = [];
  let stagesMessage: string | undefined;

  if (selectedBuildNumber == null) {
    stagesMessage = "No builds available for this job";
  } else {
    const loaded = await loadStagesForBuild(encodedName, selectedBuildNumber);
    stages = loaded.stages;
    stagesMessage = loaded.stagesMessage;
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
    selectedBuildNumber:
      selectedBuildNumber != null && Number.isFinite(selectedBuildNumber)
        ? selectedBuildNumber
        : null,
    builds,
    stages,
    ...(stagesMessage ? { stagesMessage } : {}),
  };
}

export async function getCiCdBuildStages(
  jobName: string,
  buildNumber: number
): Promise<{
  jobName: string;
  buildNumber: number;
  stages: CiCdStageItem[];
  stagesMessage?: string;
}> {
  if (!Number.isInteger(buildNumber) || buildNumber <= 0) {
    throw new CiCdError(400, "buildNumber must be a positive integer");
  }

  const encodedName = encodeURIComponent(jobName);
  const loaded = await loadStagesForBuild(encodedName, buildNumber);

  return {
    jobName,
    buildNumber,
    stages: loaded.stages,
    ...(loaded.stagesMessage ? { stagesMessage: loaded.stagesMessage } : {}),
  };
}
