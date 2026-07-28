import "server-only";

import { getAdminPool } from "@/lib/db/pool";
import { structuredLog } from "@/lib/observability/logger";

export interface ApiRequestMetric {
  requestId: string;
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  errorCode?: string | null;
  occurredAt?: Date;
}

export async function recordApiRequestMetric(metric: ApiRequestMetric) {
  try {
    await getAdminPool().query(
      `insert into public.api_request_metrics(
         request_id, route, method, status_code, duration_ms, error_code, occurred_at
       ) values ($1, $2, $3, $4, $5, $6, coalesce($7, now()))
       on conflict (request_id) do nothing`,
      [
        metric.requestId,
        metric.route,
        metric.method,
        metric.statusCode,
        Math.max(0, Math.round(metric.durationMs)),
        metric.errorCode ?? null,
        metric.occurredAt ?? null
      ]
    );
    return true;
  } catch (error) {
    structuredLog("error", "api.metric.persist_failed", {
      metric: {
        requestId: metric.requestId,
        route: metric.route,
        method: metric.method,
        statusCode: metric.statusCode,
        durationMs: metric.durationMs
      },
      error
    });
    return false;
  }
}
