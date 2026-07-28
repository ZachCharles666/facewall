import { NextResponse } from "next/server";

import {
  resolveRequestId,
  runWithRequestContext
} from "@/lib/observability/context";
import { structuredLog } from "@/lib/observability/logger";
import { captureServerException } from "@/lib/observability/monitor";
import { errorResponse } from "@/lib/schemas/contracts";
import type { WriteRequestSecurityOptions } from "@/lib/security/writeRequest";

export interface ObservedRouteOptions {
  route: string;
  persistMetric?: boolean;
  critical?: boolean;
  writeSecurity?: WriteRequestSecurityOptions;
}

async function getResponseErrorCode(response: Response) {
  const headerCode = response.headers.get("x-error-code");
  if (headerCode) return headerCode;
  if (response.status < 400 || !response.headers.get("content-type")?.includes("application/json")) {
    return null;
  }
  try {
    const body = (await response.clone().json()) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code.slice(0, 80) : null;
  } catch {
    return null;
  }
}

function isWriteRequestSecurityError(error: unknown): error is Error & {
  code: "INPUT_INVALID" | "RATE_LIMITED" | "SECURITY_DEPENDENCY_FAILED";
  status: 400 | 429 | 503;
  retryAfterSeconds?: number;
} {
  if (!(error instanceof Error) || error.name !== "WriteRequestSecurityError") {
    return false;
  }
  const candidate = error as Error & {
    code?: unknown;
    status?: unknown;
    retryAfterSeconds?: unknown;
  };
  return (
    ["INPUT_INVALID", "RATE_LIMITED", "SECURITY_DEPENDENCY_FAILED"].includes(
      String(candidate.code)
    ) &&
    [400, 429, 503].includes(Number(candidate.status)) &&
    (candidate.retryAfterSeconds === undefined ||
      Number.isSafeInteger(candidate.retryAfterSeconds))
  );
}

export async function observeRoute(
  request: Request,
  options: ObservedRouteOptions,
  operation: () => Promise<Response>
) {
  const requestId = resolveRequestId(request);
  const startedAt = performance.now();

  return runWithRequestContext(
    {
      requestId,
      route: options.route,
      method: request.method,
      startedAt
    },
    async () => {
      let response: Response;
      let errorCode: string | null = null;
      try {
        if (options.writeSecurity) {
          const { enforceWriteRequestSecurity } = await import(
            "@/lib/security/writeRequest"
          );
          await enforceWriteRequestSecurity(
            request,
            options.route,
            options.writeSecurity
          );
        }
        response = await operation();
        errorCode = await getResponseErrorCode(response);
      } catch (error) {
        if (isWriteRequestSecurityError(error)) {
          errorCode = error.code;
          response = NextResponse.json(
            errorResponse(
              error.code,
              error.code === "RATE_LIMITED"
                ? "请求过于频繁，请稍后再试"
                : error.code === "INPUT_INVALID"
                  ? "请求内容不合法"
                  : "安全校验服务暂时不可用，请稍后重试",
              error.code !== "INPUT_INVALID"
            ),
            {
              status: error.status,
              headers: error.retryAfterSeconds
                ? { "retry-after": String(error.retryAfterSeconds) }
                : undefined
            }
          );
        } else {
          errorCode = "INTERNAL_ERROR";
          await captureServerException(error, {
            route: options.route,
            method: request.method,
            critical: Boolean(options.critical)
          });
          response = NextResponse.json(
            errorResponse("INTERNAL_ERROR", "服务暂时不可用，请稍后重试", true),
            { status: 500 }
          );
        }
      }

      const durationMs = performance.now() - startedAt;
      const level = response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info";
      structuredLog(level, "api.request.completed", {
        statusCode: response.status,
        durationMs: Math.round(durationMs),
        errorCode
      });

      if (response.status >= 500) {
        await captureServerException(new Error(errorCode ?? `HTTP_${response.status}`), {
          route: options.route,
          method: request.method,
          statusCode: response.status,
          durationMs: Math.round(durationMs),
          critical: Boolean(options.critical)
        });
      }

      if (options.persistMetric !== false) {
        const { recordApiRequestMetric } = await import("@/lib/observability/metrics");
        await recordApiRequestMetric({
          requestId,
          route: options.route,
          method: request.method,
          statusCode: response.status,
          durationMs,
          errorCode
        });
      }

      response.headers.set("x-request-id", requestId);
      return response;
    }
  );
}
