import { getRequestContext } from "@/lib/observability/context";
import { scrubTelemetry } from "@/lib/observability/scrub";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  event: string;
  requestId?: string;
  route?: string;
  method?: string;
  [key: string]: unknown;
}

type LogSink = (record: StructuredLog) => void;

let testSink: LogSink | null = null;

export function setStructuredLogSinkForTests(sink: LogSink | null) {
  if (process.env.NODE_ENV !== "test") return;
  testSink = sink;
}

export function structuredLog(
  level: LogLevel,
  event: string,
  context: Record<string, unknown> = {}
) {
  const requestContext = getRequestContext();
  const record = scrubTelemetry({
    timestamp: new Date().toISOString(),
    level,
    event,
    requestId: requestContext?.requestId,
    route: requestContext?.route,
    method: requestContext?.method,
    ...context
  }) as StructuredLog;

  if (testSink) {
    testSink(record);
    return record;
  }

  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  return record;
}
