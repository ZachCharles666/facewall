import { getRequestContext } from "@/lib/observability/context";
import { structuredLog } from "@/lib/observability/logger";
import { scrubTelemetry } from "@/lib/observability/scrub";

export interface MonitorEvent {
  kind: "exception" | "alert";
  name: string;
  message: string;
  level: "warning" | "error" | "fatal";
  requestId?: string;
  tags: Record<string, string>;
  context: Record<string, unknown>;
}

export interface MonitoringProvider {
  readonly name: string;
  capture(event: MonitorEvent): Promise<void> | void;
}

let provider: MonitoringProvider | null = null;

export function configureMonitoringProvider(nextProvider: MonitoringProvider | null) {
  provider = nextProvider;
}

export function getMonitoringStatus() {
  return {
    configured: provider !== null,
    provider: provider?.name ?? "none"
  };
}

export async function captureMonitorEvent(
  event: Omit<MonitorEvent, "requestId"> & { requestId?: string }
) {
  const requestId = event.requestId ?? getRequestContext()?.requestId;
  const sanitized = scrubTelemetry({ ...event, requestId });
  if (!provider) {
    structuredLog("warn", "monitor.capture.skipped", {
      monitorConfigured: false,
      monitorEvent: sanitized
    });
    return { captured: false, provider: "none" };
  }
  try {
    await provider.capture(sanitized);
    return { captured: true, provider: provider.name };
  } catch (error) {
    structuredLog("error", "monitor.capture.failed", {
      provider: provider.name,
      error
    });
    return { captured: false, provider: provider.name };
  }
}

export function captureServerException(
  error: unknown,
  context: Record<string, unknown> = {}
) {
  const normalized =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : "UNKNOWN_SERVER_ERROR");
  return captureMonitorEvent({
    kind: "exception",
    name: normalized.name,
    message: normalized.message,
    level: "error",
    tags: { runtime: "server" },
    context: { ...context, error: normalized }
  });
}
