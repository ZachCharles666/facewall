import { scrubUrl } from "@/lib/observability/scrub";

const RUM_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const ERROR_NAME_PATTERN = /\b([A-Za-z][A-Za-z0-9]*(?:Error|Exception))\b/;
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|token|secret|password|email|phone|resume|jd|answer|transcript|report|prompt|content|body|payload|params?|query|uin|aid|user|device|screenshot|html|dom/i;
const URL_KEY_PATTERN = /url|from|origin|route|path|src|href/i;
const UUID_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{24,}$/;
const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 20;

export type TencentRumLogType =
  | "log"
  | "speed"
  | "performance"
  | "vitals"
  | "pv"
  | string;

export interface TencentRumEnvelope {
  logs: unknown;
  logType: TencentRumLogType;
}

export interface TencentRumClientError {
  name: string;
  source:
    | "error-boundary"
    | "window-error"
    | "unhandled-rejection"
    | "resource-error";
  path: string;
  stack?: string;
}

export function isTencentRumEnabled(
  enabled: string | undefined,
  projectId: string | undefined
) {
  return enabled === "true" && RUM_ID_PATTERN.test(projectId ?? "");
}

export function extractTencentRumResponseRequestId(context: unknown) {
  if (!context || typeof context !== "object") return undefined;
  try {
    const headers = (context as { headers?: unknown }).headers;
    if (headers && typeof headers === "object") {
      const get = (headers as { get?: unknown }).get;
      if (typeof get === "function") {
        const requestId = String(
          (get as (name: string) => unknown).call(headers, "x-request-id") ?? ""
        ).trim();
        return REQUEST_ID_PATTERN.test(requestId) ? requestId : undefined;
      }
    }

    const getResponseHeader = (
      context as { getResponseHeader?: unknown }
    ).getResponseHeader;
    if (typeof getResponseHeader === "function") {
      const requestId = String(
        (getResponseHeader as (name: string) => unknown).call(
          context,
          "x-request-id"
        ) ?? ""
      ).trim();
      return REQUEST_ID_PATTERN.test(requestId) ? requestId : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function normalizePathSegments(pathname: string) {
  const normalized = pathname
    .split("/")
    .map((segment) => {
      if (
        segment === "[REDACTED]" ||
        /^\d+$/.test(segment) ||
        UUID_SEGMENT_PATTERN.test(segment) ||
        OPAQUE_SEGMENT_PATTERN.test(segment)
      ) {
        return ":id";
      }
      return segment;
    })
    .join("/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

export function sanitizeRumUrl(value: string) {
  const scrubbed = scrubUrl(value);
  try {
    const parsed = new URL(scrubbed, "https://passbuddy.invalid");
    return normalizePathSegments(parsed.pathname);
  } catch {
    return normalizePathSegments(scrubbed.split(/[?#]/, 1)[0] || "/");
  }
}

function sanitizeStack(value: unknown) {
  if (typeof value !== "string") return undefined;
  const frames = value
    .split(/\r?\n/)
    .filter((line) => /^\s*at\s/.test(line))
    .slice(0, 12)
    .map((line) =>
      line
        .replace(
          /https?:\/\/[^\s)]+/g,
          (url) => sanitizeRumUrl(url)
        )
        .slice(0, 300)
    );
  return frames.length ? frames.join("\n") : undefined;
}

function extractRequestId(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== "object" || depth > MAX_DEPTH) return undefined;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (/^(x-request-id|requestId)$/i.test(key)) {
      const requestId = String(nested ?? "");
      if (REQUEST_ID_PATTERN.test(requestId)) return requestId;
    }
    const nestedRequestId = extractRequestId(nested, depth + 1);
    if (nestedRequestId) return nestedRequestId;
  }
  return undefined;
}

function extractMetricRequestId(value: unknown) {
  const nestedRequestId = extractRequestId(value);
  if (nestedRequestId) return nestedRequestId;
  if (!value || typeof value !== "object") return undefined;
  const ret = String((value as Record<string, unknown>).ret ?? "");
  return REQUEST_ID_PATTERN.test(ret) ? ret : undefined;
}

function sanitizeMetricValue(value: unknown, key: string, depth: number): unknown {
  if (/^(x-request-id|requestId)$/i.test(key)) {
    const requestId = String(value ?? "");
    return REQUEST_ID_PATTERN.test(requestId) ? requestId : undefined;
  }
  if (depth > MAX_DEPTH || SENSITIVE_KEY_PATTERN.test(key)) return undefined;
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (typeof value === "string") {
    if (URL_KEY_PATTERN.test(key)) return sanitizeRumUrl(value);
    if (/^(method|type|status|ret|code|name|metric|rating)$/i.test(key)) {
      return value.slice(0, 80);
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeMetricValue(item, key, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([nestedKey, nestedValue]) => [
          nestedKey,
          sanitizeMetricValue(nestedValue, nestedKey, depth + 1)
        ])
        .filter((entry) => entry[1] !== undefined)
    );
  }
  return undefined;
}

function hasMetricData(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasMetricData);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return value !== undefined;
}

function sanitizeMetricRecord(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const requestId = extractMetricRequestId(value);
  const sanitized = sanitizeMetricValue(value, "root", 0);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return requestId ? { requestId } : {};
  }
  return {
    ...(sanitized as Record<string, unknown>),
    ...(requestId ? { requestId } : {})
  };
}

function sanitizeMetricLog(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map(sanitizeMetricRecord)
      .filter(hasMetricData);
  }
  return sanitizeMetricRecord(value);
}

function sanitizeErrorLog(value: unknown) {
  const log =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : { msg: value };
  const rawMessage = String(log.msg ?? "");
  const rawName = String(log.name ?? "");
  const name =
    rawName.match(ERROR_NAME_PATTERN)?.[1] ??
    rawMessage.match(ERROR_NAME_PATTERN)?.[1] ??
    "BrowserError";
  const level =
    typeof log.level === "string" || typeof log.level === "number"
      ? log.level
      : undefined;
  const trace = sanitizeStack(log.trace ?? log.stack ?? rawMessage);
  const from =
    typeof log.from === "string" ? sanitizeRumUrl(log.from) : undefined;
  const requestId = extractRequestId(log);
  return {
    msg: name.slice(0, 80),
    ...(level !== undefined ? { level } : {}),
    ...(trace ? { trace } : {}),
    ...(from ? { from } : {}),
    ...(typeof log.ext1 === "string" ? { ext1: log.ext1.slice(0, 40) } : {}),
    ...(typeof log.ext2 === "string"
      ? { ext2: sanitizeRumUrl(log.ext2) }
      : {}),
    ...(requestId ? { requestId } : {})
  };
}

export function sanitizeTencentRumEnvelope(
  envelope: TencentRumEnvelope
): TencentRumEnvelope | false {
  if (!envelope || typeof envelope !== "object") return false;
  // Aegis routes both the official whitelist and rate-config handshakes
  // through beforeRequest as a whiteList envelope with no log payload.
  // Permit only that empty control-plane shape; never pass user data through.
  if (envelope.logType === "whiteList") {
    return envelope.logs == null
      ? { logType: "whiteList", logs: null }
      : false;
  }
  if (envelope.logType === "log") {
    return { logType: "log", logs: sanitizeErrorLog(envelope.logs) };
  }
  const logs = sanitizeMetricLog(envelope.logs);
  if (!hasMetricData(logs)) return false;
  return {
    logType: envelope.logType,
    logs
  };
}

export function sanitizeTencentRumClientError(
  error: TencentRumClientError
): TencentRumClientError {
  const normalizedName =
    error.name.match(ERROR_NAME_PATTERN)?.[1] ?? "BrowserError";
  return {
    name: normalizedName.slice(0, 80),
    source: error.source,
    path: sanitizeRumUrl(error.path),
    stack: sanitizeStack(error.stack)
  };
}
