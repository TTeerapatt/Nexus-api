export class VpsError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "VpsError";
    this.statusCode = statusCode;
  }
}

export type VpsIpAddress = {
  id: number | null;
  address: string;
  ptr: string | null;
};

export type VpsTemplate = {
  id: number | null;
  name: string | null;
  description: string | null;
};

export type VpsVirtualMachine = {
  id: number;
  hostname: string;
  state: string;
  plan: string | null;
  cpus: number | null;
  memory_mb: number | null;
  disk_mb: number | null;
  bandwidth_mb: number | null;
  data_center_id: number | null;
  firewall_group_id: number | null;
  subscription_id: string | null;
  actions_lock: string | null;
  ns1: string | null;
  ns2: string | null;
  ipv4: VpsIpAddress[];
  ipv6: VpsIpAddress[];
  template: VpsTemplate | null;
  created_at: string | null;
};

export type VpsMetricSeries = {
  unit: string | null;
  points: Array<{ timestamp: number; value: number }>;
  latest: number | null;
};

export type VpsMetrics = {
  cpu_usage: VpsMetricSeries | null;
  ram_usage: VpsMetricSeries | null;
  disk_space: VpsMetricSeries | null;
  outgoing_traffic: VpsMetricSeries | null;
  incoming_traffic: VpsMetricSeries | null;
  uptime: VpsMetricSeries | null;
};

export type VpsPowerAction = "start" | "stop" | "restart";

type HostingerRaw = Record<string, unknown>;

const HOSTINGER_BASE_URL = "https://developers.hostinger.com";

function getHostingerToken(): string {
  const token = (process.env.HOSTINGER_API_TOKEN || "").trim();
  if (!token) {
    throw new VpsError(500, "HOSTINGER_API_TOKEN is not configured");
  }
  return token;
}

function asRecord(value: unknown): HostingerRaw | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as HostingerRaw;
  }
  return null;
}

function pick(raw: HostingerRaw, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) {
      return raw[key];
    }
  }
  return undefined;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function mapIp(raw: unknown): VpsIpAddress | null {
  const row = asRecord(raw);
  if (!row) return null;
  const address = asString(pick(row, "address", "ip", "ip_address"));
  if (!address) return null;
  return {
    id: asNumber(pick(row, "id")),
    address,
    ptr: asString(pick(row, "ptr")),
  };
}

function mapTemplate(raw: unknown): VpsTemplate | null {
  const row = asRecord(raw);
  if (!row) return null;
  return {
    id: asNumber(pick(row, "id")),
    name: asString(pick(row, "name")),
    description: asString(pick(row, "description")),
  };
}

function mapVirtualMachine(raw: unknown): VpsVirtualMachine | null {
  const row = asRecord(raw);
  if (!row) return null;

  const id = asNumber(pick(row, "id"));
  if (id === null) return null;

  const ipv4Raw = pick(row, "ipv4", "ipv4_addresses") ?? [];
  const ipv6Raw = pick(row, "ipv6", "ipv6_addresses") ?? [];

  return {
    id,
    hostname: asString(pick(row, "hostname")) || `vps-${id}`,
    state: (asString(pick(row, "state", "status")) || "unknown").toLowerCase(),
    plan: asString(pick(row, "plan")),
    cpus: asNumber(pick(row, "cpus", "cpu")),
    memory_mb: asNumber(pick(row, "memory", "memory_mb")),
    disk_mb: asNumber(pick(row, "disk", "disk_mb")),
    bandwidth_mb: asNumber(pick(row, "bandwidth", "bandwidth_mb")),
    data_center_id: asNumber(pick(row, "data_center_id", "dataCenterId")),
    firewall_group_id: asNumber(
      pick(row, "firewall_group_id", "firewallGroupId")
    ),
    subscription_id: asString(pick(row, "subscription_id", "subscriptionId")),
    actions_lock: asString(pick(row, "actions_lock", "actionsLock")),
    ns1: asString(pick(row, "ns1")),
    ns2: asString(pick(row, "ns2")),
    ipv4: Array.isArray(ipv4Raw)
      ? ipv4Raw.map(mapIp).filter((item): item is VpsIpAddress => item != null)
      : [],
    ipv6: Array.isArray(ipv6Raw)
      ? ipv6Raw.map(mapIp).filter((item): item is VpsIpAddress => item != null)
      : [],
    template: mapTemplate(pick(row, "template")),
    created_at: asString(pick(row, "created_at", "createdAt")),
  };
}

function extractList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const row = asRecord(payload);
  if (!row) return [];
  const nested =
    pick(row, "data", "items", "virtual_machines", "virtualMachines") ?? [];
  return Array.isArray(nested) ? nested : [];
}

function mapMetricSeries(raw: unknown): VpsMetricSeries | null {
  const row = asRecord(raw);
  if (!row) return null;

  const usageRaw = pick(row, "usage");
  const usage = asRecord(usageRaw) ?? {};
  const points = Object.entries(usage)
    .map(([timestamp, value]) => {
      const ts = Number(timestamp);
      const val = Number(value);
      if (!Number.isFinite(ts) || !Number.isFinite(val)) return null;
      return { timestamp: ts, value: val };
    })
    .filter((item): item is { timestamp: number; value: number } => item != null)
    .sort((a, b) => a.timestamp - b.timestamp);

  return {
    unit: asString(pick(row, "unit")),
    points,
    latest: points.length > 0 ? points[points.length - 1].value : null,
  };
}

function mapMetrics(payload: unknown): VpsMetrics {
  const row = asRecord(payload) ?? {};
  return {
    cpu_usage: mapMetricSeries(pick(row, "cpu_usage", "cpuUsage")),
    ram_usage: mapMetricSeries(pick(row, "ram_usage", "ramUsage")),
    disk_space: mapMetricSeries(pick(row, "disk_space", "diskSpace")),
    outgoing_traffic: mapMetricSeries(
      pick(row, "outgoing_traffic", "outgoingTraffic")
    ),
    incoming_traffic: mapMetricSeries(
      pick(row, "incoming_traffic", "incomingTraffic")
    ),
    uptime: mapMetricSeries(pick(row, "uptime")),
  };
}

async function hostingerFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getHostingerToken();
  const url = `${HOSTINGER_BASE_URL}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new VpsError(502, "Unable to reach Hostinger API");
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const row = asRecord(body);
    const message =
      asString(pick(row ?? {}, "message", "error", "error_message")) ||
      `Hostinger API error (${response.status})`;
    const status =
      response.status >= 400 && response.status < 600 ? response.status : 502;
    throw new VpsError(status, message);
  }

  return body as T;
}

function parseVmId(value: string | number): number {
  const id = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new VpsError(400, "Invalid virtual machine id");
  }
  return id;
}

export async function listVirtualMachines(): Promise<VpsVirtualMachine[]> {
  const payload = await hostingerFetch<unknown>("/api/vps/v1/virtual-machines");
  return extractList(payload)
    .map(mapVirtualMachine)
    .filter((item): item is VpsVirtualMachine => item != null)
    .sort((a, b) => a.hostname.localeCompare(b.hostname));
}

export async function getVirtualMachineById(
  idRaw: string | number
): Promise<VpsVirtualMachine> {
  const id = parseVmId(idRaw);
  const payload = await hostingerFetch<unknown>(
    `/api/vps/v1/virtual-machines/${id}`
  );
  const mapped = mapVirtualMachine(payload);
  if (!mapped) {
    throw new VpsError(404, "Virtual machine not found");
  }
  return mapped;
}

export async function getVirtualMachineMetrics(
  idRaw: string | number,
  dateFrom?: string,
  dateTo?: string
): Promise<VpsMetrics> {
  const id = parseVmId(idRaw);

  const to = dateTo?.trim() || new Date().toISOString();
  const from =
    dateFrom?.trim() ||
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const query = new URLSearchParams({
    date_from: from,
    date_to: to,
  });

  const payload = await hostingerFetch<unknown>(
    `/api/vps/v1/virtual-machines/${id}/metrics?${query.toString()}`
  );
  return mapMetrics(payload);
}

export async function runVirtualMachinePowerAction(
  idRaw: string | number,
  action: VpsPowerAction
): Promise<{ id: number; action: VpsPowerAction; result: unknown }> {
  const id = parseVmId(idRaw);
  if (action !== "start" && action !== "stop" && action !== "restart") {
    throw new VpsError(400, "action must be one of: start, stop, restart");
  }

  const result = await hostingerFetch<unknown>(
    `/api/vps/v1/virtual-machines/${id}/${action}`,
    { method: "POST" }
  );

  return { id, action, result };
}
