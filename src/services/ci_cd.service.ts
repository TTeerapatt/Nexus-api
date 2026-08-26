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
  id: string;
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
  id?: string | number;
  name?: string;
  status?: string;
  durationMillis?: number;
};

type JenkinsWfapiDescribe = {
  stages?: JenkinsWfapiStage[];
};

type JenkinsWfapiLog = {
  nodeId?: string;
  nodeStatus?: string;
  length?: number;
  hasMore?: boolean;
  text?: string;
  consoleUrl?: string;
};

type JenkinsWfapiNodeDescribe = {
  id?: string | number;
  name?: string;
  status?: string;
  stageFlowNodes?: JenkinsWfapiNodeDescribe[];
  stages?: JenkinsWfapiNodeDescribe[];
  _links?: {
    log?: { href?: string };
    self?: { href?: string };
  };
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

/** Jenkins wfapi logs often come as HTML (timestamps/links). Convert to plain text. */
function htmlLogToPlainText(input: string): string {
  if (!input) return "";

  let text = String(input);
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(text);
  if (looksLikeHtml) {
    text = text
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/\s*p\s*>/gi, "\n")
      .replace(/<\/\s*div\s*>/gi, "\n")
      .replace(/<\/\s*tr\s*>/gi, "\n")
      .replace(/<\s*li[^>]*>/gi, "- ")
      .replace(/<\/\s*li\s*>/gi, "\n")
      // Prefer visible timestamp text; drop hidden ISO timestamps.
      .replace(
        /<span[^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/span>/gi,
        ""
      )
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#(\d+);/g, (_, code: string) => {
        const n = Number(code);
        return Number.isFinite(n) ? String.fromCharCode(n) : "";
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
        const n = Number.parseInt(hex, 16);
        return Number.isFinite(n) ? String.fromCharCode(n) : "";
      });
  }

  return formatLogLinesWithSeparator(
    text
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Format `03:37:12 message` -> `03:37:12 || message` */
function formatLogLinesWithSeparator(input: string): string {
  return input
    .split("\n")
    .map((line) => {
      const trimmed = line.trimEnd();
      if (!trimmed) return trimmed;

      // Already formatted
      if (/^\d{1,2}:\d{2}:\d{2}\s+\|\|/.test(trimmed)) {
        return trimmed.replace(
          /^(\d{1,2}:\d{2}:\d{2})\s+\|\|\s*/,
          "$1     ||     "
        );
      }

      const matched = trimmed.match(/^(\d{1,2}:\d{2}:\d{2})\s+(.*)$/);
      if (!matched) return trimmed;

      const [, time, message] = matched;
      if (!message.trim()) return time;
      return `${time}     ||     ${message.trim()}`;
    })
    .join("\n");
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
    .map((stage, index) => ({
      id: String(stage.id ?? index),
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

export async function getCiCdStageLog(
  jobName: string,
  buildNumber: number,
  stageId: string
): Promise<{
  jobName: string;
  buildNumber: number;
  stageId: string;
  text: string;
  hasMore: boolean;
  consoleUrl: string | null;
}> {
  if (!Number.isInteger(buildNumber) || buildNumber <= 0) {
    throw new CiCdError(400, "buildNumber must be a positive integer");
  }

  const normalizedStageId = String(stageId || "").trim();
  if (!normalizedStageId) {
    throw new CiCdError(400, "stageId is required");
  }

  const encodedName = encodeURIComponent(jobName);
  const nodeBase = `/job/${encodedName}/${buildNumber}/execution/node`;

  async function fetchNodeLog(nodeId: string): Promise<{
    text: string;
    hasMore: boolean;
    consoleUrl: string | null;
  }> {
    const encodedNodeId = encodeURIComponent(nodeId);
    try {
      const log = await jenkinsFetch<JenkinsWfapiLog>(
        `${nodeBase}/${encodedNodeId}/wfapi/log`
      );
      return {
        text: htmlLogToPlainText(typeof log.text === "string" ? log.text : ""),
        hasMore: Boolean(log.hasMore),
        consoleUrl:
          typeof log.consoleUrl === "string" && log.consoleUrl.trim()
            ? log.consoleUrl.trim()
            : null,
      };
    } catch (error) {
      if (error instanceof CiCdError && error.statusCode === 404) {
        return { text: "", hasMore: false, consoleUrl: null };
      }
      throw error;
    }
  }

  async function fetchNodeDescribe(
    nodeId: string
  ): Promise<JenkinsWfapiNodeDescribe | null> {
    const encodedNodeId = encodeURIComponent(nodeId);
    try {
      return await jenkinsFetch<JenkinsWfapiNodeDescribe>(
        `${nodeBase}/${encodedNodeId}/wfapi/describe`
      );
    } catch (error) {
      if (error instanceof CiCdError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  function childNodes(node: JenkinsWfapiNodeDescribe): JenkinsWfapiNodeDescribe[] {
    if (Array.isArray(node.stageFlowNodes) && node.stageFlowNodes.length > 0) {
      return node.stageFlowNodes;
    }
    if (Array.isArray(node.stages) && node.stages.length > 0) {
      return node.stages;
    }
    return [];
  }

  async function collectNodeLogs(
    nodeId: string,
    depth: number
  ): Promise<{
    chunks: string[];
    hasMore: boolean;
    consoleUrl: string | null;
  }> {
    if (depth > 4) {
      return { chunks: [], hasMore: false, consoleUrl: null };
    }

    const own = await fetchNodeLog(nodeId);
    const chunks: string[] = [];
    if (own.text.trim()) {
      chunks.push(own.text.trimEnd());
    }

    let hasMore = own.hasMore;
    let consoleUrl = own.consoleUrl;

    // Stage nodes often have empty logs; collect child step logs instead.
    if (!own.text.trim()) {
      const describe = await fetchNodeDescribe(nodeId);
      const children = describe ? childNodes(describe) : [];

      for (const child of children) {
        const childId = String(child.id ?? "").trim();
        if (!childId) continue;

        const childName = String(child.name || "").trim();
        const childResult = await collectNodeLogs(childId, depth + 1);
        if (childResult.chunks.length > 0) {
          if (childName) {
            chunks.push(`--- ${childName} ---`);
          }
          chunks.push(...childResult.chunks);
        }
        hasMore = hasMore || childResult.hasMore;
        if (!consoleUrl && childResult.consoleUrl) {
          consoleUrl = childResult.consoleUrl;
        }
      }
    }

    return { chunks, hasMore, consoleUrl };
  }

  try {
    const collected = await collectNodeLogs(normalizedStageId, 0);
    const text = htmlLogToPlainText(collected.chunks.join("\n\n"));

    return {
      jobName,
      buildNumber,
      stageId: normalizedStageId,
      text,
      hasMore: collected.hasMore,
      consoleUrl: collected.consoleUrl,
    };
  } catch (error) {
    if (error instanceof CiCdError && error.statusCode === 404) {
      throw new CiCdError(404, "Stage log is not available for this node");
    }
    throw error;
  }
}
