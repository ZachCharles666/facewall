import { captureMonitorEvent } from "@/lib/observability/monitor";

export interface AlertSnapshot {
  windowMinutes: number;
  authRequests: number;
  authFailures: number;
  criticalRequests: number;
  criticalFailures: number;
  databaseErrors: number;
  severeFrontendErrors: number;
}

export interface AlertThresholds {
  authFailureCount: number;
  criticalMinimumRequests: number;
  criticalFailureRate: number;
  databaseErrorCount: number;
  frontendErrorCount: number;
}

export const defaultAlertThresholds: AlertThresholds = {
  authFailureCount: 3,
  criticalMinimumRequests: 5,
  criticalFailureRate: 0.2,
  databaseErrorCount: 1,
  frontendErrorCount: 1
};

export function evaluateAlertSnapshot(
  snapshot: AlertSnapshot,
  thresholds: AlertThresholds = defaultAlertThresholds
) {
  const criticalFailureRate = snapshot.criticalRequests
    ? snapshot.criticalFailures / snapshot.criticalRequests
    : 0;
  return [
    {
      code: "AUTH_UNAVAILABLE",
      triggered: snapshot.authFailures >= thresholds.authFailureCount,
      severity: "fatal" as const,
      value: snapshot.authFailures
    },
    {
      code: "CRITICAL_API_HIGH_FAILURE_RATE",
      triggered:
        snapshot.criticalRequests >= thresholds.criticalMinimumRequests &&
        criticalFailureRate >= thresholds.criticalFailureRate,
      severity: "error" as const,
      value: criticalFailureRate
    },
    {
      code: "DATABASE_UNAVAILABLE",
      triggered: snapshot.databaseErrors >= thresholds.databaseErrorCount,
      severity: "fatal" as const,
      value: snapshot.databaseErrors
    },
    {
      code: "SEVERE_FRONTEND_ERROR",
      triggered:
        snapshot.severeFrontendErrors >= thresholds.frontendErrorCount,
      severity: "error" as const,
      value: snapshot.severeFrontendErrors
    }
  ];
}

export async function readAlertSnapshot(windowMinutes = 5) {
  if (!Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > 60) {
    throw new Error("INPUT_INVALID");
  }
  const { getAdminPool } = await import("@/lib/db/pool");
  const result = await getAdminPool().query(
    `select
       count(*) filter (
         where route in ('/api/auth/request-otp', '/api/auth/verify-otp', '/api/auth/session')
       )::int as auth_requests,
       count(*) filter (
         where route in ('/api/auth/request-otp', '/api/auth/verify-otp', '/api/auth/session')
           and status_code >= 500
       )::int as auth_failures,
       count(*) filter (
         where route in (
           '/api/auth/request-otp', '/api/auth/verify-otp',
           '/api/interview-sessions', '/api/report/generate'
         )
       )::int as critical_requests,
       count(*) filter (
         where route in (
           '/api/auth/request-otp', '/api/auth/verify-otp',
           '/api/interview-sessions', '/api/report/generate'
         ) and status_code >= 500
       )::int as critical_failures,
       count(*) filter (
         where error_code in (
           'PERSISTENCE_FAILED', 'PRIVACY_OPERATION_FAILED',
           'ADMIN_OPERATION_FAILED', 'ADMIN_QUERY_FAILED'
         )
       )::int as database_errors,
       count(*) filter (
         where route = '/api/monitor/client-error' and status_code < 400
       )::int as severe_frontend_errors
     from public.api_request_metrics
    where occurred_at >= now() - make_interval(mins => $1)`,
    [windowMinutes]
  );
  const row = result.rows[0];
  return {
    windowMinutes,
    authRequests: Number(row.auth_requests),
    authFailures: Number(row.auth_failures),
    criticalRequests: Number(row.critical_requests),
    criticalFailures: Number(row.critical_failures),
    databaseErrors: Number(row.database_errors),
    severeFrontendErrors: Number(row.severe_frontend_errors)
  } satisfies AlertSnapshot;
}

export async function evaluateAndDispatchAlerts(windowMinutes = 5) {
  const snapshot = await readAlertSnapshot(windowMinutes);
  const signals = evaluateAlertSnapshot(snapshot);
  const deliveries = [];
  for (const signal of signals.filter((item) => item.triggered)) {
    deliveries.push({
      code: signal.code,
      ...(await captureMonitorEvent({
        kind: "alert",
        name: signal.code,
        message: `${signal.code} threshold exceeded`,
        level: signal.severity,
        tags: { windowMinutes: String(windowMinutes) },
        context: { snapshot, value: signal.value }
      }))
    });
  }
  return { snapshot, signals, deliveries };
}
