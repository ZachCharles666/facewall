"use client";

import { captureTencentRumClientError } from "@/lib/observability/tencentRum";

const MAX_MESSAGE_LENGTH = 300;

function safeMessage(value: unknown) {
  const raw = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  return raw
    .replace(/([?&](?:token|secret|key|code|otp)=)[^&#\s]*/gi, "$1[REDACTED]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b\d{6}\b/g, "[REDACTED]")
    .slice(0, MAX_MESSAGE_LENGTH);
}

export function reportClientError(
  error: unknown,
  context: {
    source:
      | "error-boundary"
      | "window-error"
      | "unhandled-rejection"
      | "resource-error";
  }
) {
  const payload = {
    name: error instanceof Error ? error.name.slice(0, 80) : "ClientError",
    message: safeMessage(error),
    source: context.source,
    path: typeof window === "undefined" ? "/" : window.location.pathname
  };
  captureTencentRumClientError({
    name: payload.name,
    source: payload.source,
    path: payload.path,
    stack: error instanceof Error ? error.stack : undefined
  });
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const body = new Blob([JSON.stringify(payload)], { type: "application/json" });
    if (navigator.sendBeacon("/api/monitor/client-error", body)) return;
  }
  void fetch("/api/monitor/client-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => undefined);
}
