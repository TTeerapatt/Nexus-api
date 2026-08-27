export class DomainError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "DomainError";
    this.statusCode = statusCode;
  }
}

export type DomainListItem = {
  id: number | null;
  domain: string;
  type: string | null;
  status: string;
  created_at: string | null;
  expires_at: string | null;
};

export type DomainDetail = {
  domain: string;
  status: string;
  message: string | null;
  is_privacy_protection_allowed: boolean | null;
  is_privacy_protected: boolean | null;
  is_lockable: boolean | null;
  is_locked: boolean | null;
  ns1: string | null;
  ns2: string | null;
  created_at: string | null;
  updated_at: string | null;
  registered_at: string | null;
  expires_at: string | null;
};

export type DnsRecordItem = {
  name: string;
  type: string;
  ttl: number | null;
  content: string;
  is_disabled: boolean;
};

type HostingerRaw = Record<string, unknown>;

const HOSTINGER_BASE_URL = "https://developers.hostinger.com";

function getHostingerToken(): string {
  const token = (process.env.HOSTINGER_API_TOKEN || "").trim();
  if (!token) {
    throw new DomainError(500, "HOSTINGER_API_TOKEN is not configured");
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

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

function extractList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const row = asRecord(payload);
  if (!row) return [];
  const nested = pick(row, "data", "items", "domains") ?? [];
  return Array.isArray(nested) ? nested : [];
}

function normalizeDomainName(value: string): string {
  const domain = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
  if (!domain || domain.includes("/") || domain.includes(" ")) {
    throw new DomainError(400, "Invalid domain name");
  }
  return domain;
}

function mapDomainListItem(raw: unknown): DomainListItem | null {
  const row = asRecord(raw);
  if (!row) return null;

  const domain = asString(pick(row, "domain", "name"));
  if (!domain) return null;

  return {
    id: asNumber(pick(row, "id")),
    domain,
    type: asString(pick(row, "type")),
    status: (asString(pick(row, "status", "state")) || "unknown").toLowerCase(),
    created_at: asString(pick(row, "created_at", "createdAt")),
    expires_at: asString(pick(row, "expires_at", "expiresAt")),
  };
}

function mapDomainDetail(raw: unknown, fallbackDomain: string): DomainDetail {
  const row = asRecord(raw) ?? {};
  const nameServers = asRecord(
    pick(row, "name_servers", "nameServers") ?? {}
  );

  return {
    domain:
      asString(pick(row, "domain", "name")) || fallbackDomain,
    status: (asString(pick(row, "status", "state")) || "unknown").toLowerCase(),
    message: asString(pick(row, "message")),
    is_privacy_protection_allowed: asBoolean(
      pick(
        row,
        "is_privacy_protection_allowed",
        "isPrivacyProtectionAllowed"
      )
    ),
    is_privacy_protected: asBoolean(
      pick(row, "is_privacy_protected", "isPrivacyProtected")
    ),
    is_lockable: asBoolean(pick(row, "is_lockable", "isLockable")),
    is_locked: asBoolean(pick(row, "is_locked", "isLocked")),
    ns1: asString(pick(nameServers ?? {}, "ns1")),
    ns2: asString(pick(nameServers ?? {}, "ns2")),
    created_at: asString(pick(row, "created_at", "createdAt")),
    updated_at: asString(pick(row, "updated_at", "updatedAt")),
    registered_at: asString(pick(row, "registered_at", "registeredAt")),
    expires_at: asString(pick(row, "expires_at", "expiresAt")),
  };
}

function mapDnsRecords(payload: unknown): DnsRecordItem[] {
  const groups = extractList(payload);
  const flat: DnsRecordItem[] = [];

  for (const groupRaw of groups) {
    const group = asRecord(groupRaw);
    if (!group) continue;

    const name = asString(pick(group, "name")) || "@";
    const type = (asString(pick(group, "type")) || "UNKNOWN").toUpperCase();
    const ttl = asNumber(pick(group, "ttl"));
    const recordsRaw = pick(group, "records") ?? [];
    const records = Array.isArray(recordsRaw) ? recordsRaw : [];

    if (records.length === 0) {
      flat.push({
        name,
        type,
        ttl,
        content: "-",
        is_disabled: false,
      });
      continue;
    }

    for (const recordRaw of records) {
      const record = asRecord(recordRaw);
      flat.push({
        name,
        type,
        ttl,
        content: asString(pick(record ?? {}, "content", "value")) || "-",
        is_disabled:
          asBoolean(pick(record ?? {}, "is_disabled", "isDisabled")) ?? false,
      });
    }
  }

  return flat.sort((a, b) => {
    const typeCmp = a.type.localeCompare(b.type);
    if (typeCmp !== 0) return typeCmp;
    return a.name.localeCompare(b.name);
  });
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
    throw new DomainError(502, "Unable to reach Hostinger API");
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
    throw new DomainError(status, message);
  }

  return body as T;
}

export async function listDomains(): Promise<DomainListItem[]> {
  const payload = await hostingerFetch<unknown>("/api/domains/v1/portfolio");
  return extractList(payload)
    .map(mapDomainListItem)
    .filter((item): item is DomainListItem => item != null)
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

export async function getDomainByName(
  domainRaw: string
): Promise<DomainDetail> {
  const domain = normalizeDomainName(domainRaw);
  const payload = await hostingerFetch<unknown>(
    `/api/domains/v1/portfolio/${encodeURIComponent(domain)}`
  );
  return mapDomainDetail(payload, domain);
}

export async function getDomainDnsRecords(
  domainRaw: string
): Promise<DnsRecordItem[]> {
  const domain = normalizeDomainName(domainRaw);
  const payload = await hostingerFetch<unknown>(
    `/api/dns/v1/zones/${encodeURIComponent(domain)}`
  );
  return mapDnsRecords(payload);
}
