import { NextResponse } from "next/server";

import { captureMonitorEvent } from "@/lib/observability/monitor";
import { observeRoute } from "@/lib/observability/route";
import { scrubTelemetry } from "@/lib/observability/scrub";
import { errorResponse, okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

const allowedSources = new Set([
  "error-boundary",
  "window-error",
  "unhandled-rejection"
]);

function validatePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.name !== "string" ||
    payload.name.length < 1 ||
    payload.name.length > 80 ||
    typeof payload.message !== "string" ||
    payload.message.length < 1 ||
    payload.message.length > 500 ||
    typeof payload.source !== "string" ||
    !allowedSources.has(payload.source) ||
    typeof payload.path !== "string" ||
    !payload.path.startsWith("/") ||
    payload.path.length > 300
  ) {
    return null;
  }
  return scrubTelemetry({
    name: payload.name,
    message: payload.message,
    source: payload.source,
    path: payload.path.split("?")[0]
  });
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    { route: "/api/monitor/client-error", persistMetric: true, critical: true },
    async () => {
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (
        !request.headers.get("content-type")?.includes("application/json") ||
        contentLength > 8_192
      ) {
        return NextResponse.json(
          errorResponse("INPUT_INVALID", "请求内容不合法", false),
          { status: 400 }
        );
      }
      const payload = validatePayload(await request.json().catch(() => null));
      if (!payload) {
        return NextResponse.json(
          errorResponse("INPUT_INVALID", "请求内容不合法", false),
          { status: 400 }
        );
      }
      const result = await captureMonitorEvent({
        kind: "exception",
        name: payload.name,
        message: payload.message,
        level: "error",
        tags: { runtime: "browser", source: payload.source },
        context: { path: payload.path }
      });
      return NextResponse.json(okResponse({ accepted: true, captured: result.captured }));
    }
  );
}
