const REDACTED = "[REDACTED]";
const OMITTED_BODY = "[USER_CONTENT_OMITTED]";
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 30;
const MAX_STRING_LENGTH = 500;

const secretKeyPattern =
  /(^|_|\b)(authorization|cookie|set-cookie|password|passwd|secret|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|session[-_]?token|dsn|otp|verification[-_]?code|invite[-_]?code)(_|$|\b)/i;
const bodyKeyPattern =
  /(^|_|\b)(resume|resumeText|jd|jdText|answer|answerText|transcript|report|candidateProfile|questions|questionText|optimizedAnswer|oralVersion60s|copyText|comment|reason|content)(_|$|\b)/i;
const credentialInTextPattern =
  /((?:authorization|cookie|token|secret|api[-_]?key|dsn|otp|code)\s*[:=]\s*)([^\s,;&]+)/gi;
const querySecretPattern =
  /([?&](?:token|secret|api_key|apikey|key|code|otp|authorization|session)=)[^&#\s]*/gi;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const sixDigitOtpPattern = /\b\d{6}\b/g;

function scrubText(value: string) {
  return value
    .replace(querySecretPattern, `$1${REDACTED}`)
    .replace(bearerPattern, `Bearer ${REDACTED}`)
    .replace(credentialInTextPattern, `$1${REDACTED}`)
    .replace(sixDigitOtpPattern, REDACTED)
    .slice(0, MAX_STRING_LENGTH);
}

function scrubValue(value: unknown, key: string | null, depth: number): unknown {
  if (key && secretKeyPattern.test(key)) return REDACTED;
  if (key && bodyKeyPattern.test(key)) return OMITTED_BODY;
  if (
    key &&
    /^(requestId|sessionId|targetId|schoolId|userId|route|method)$/i.test(key) &&
    typeof value === "string"
  ) {
    return value.slice(0, 128);
  }
  if (depth > MAX_DEPTH) return "[MAX_DEPTH]";
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") return scrubText(value);
  if (value instanceof Error) {
    return {
      name: scrubText(value.name),
      message: scrubText(value.message),
      stack: value.stack ? scrubText(value.stack) : undefined
    };
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => scrubValue(item, null, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
        nestedKey,
        scrubValue(nestedValue, nestedKey, depth + 1)
      ])
    );
  }
  return scrubText(String(value));
}

export function scrubTelemetry<T>(value: T): T {
  return scrubValue(value, null, 0) as T;
}

export function scrubUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return scrubText(value.split("?")[0]);
  }
}
