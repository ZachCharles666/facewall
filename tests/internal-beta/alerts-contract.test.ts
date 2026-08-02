import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultAlertThresholds,
  evaluateAlertSnapshot
} from "../../lib/observability/alerts";
import {
  captureMonitorEvent,
  configureMonitoringProvider
} from "../../lib/observability/monitor";

test("alert rules cover auth, critical API, DB and severe frontend errors", () => {
  const signals = evaluateAlertSnapshot({
    windowMinutes: 5,
    authRequests: 4,
    authFailures: defaultAlertThresholds.authFailureCount,
    criticalRequests: 10,
    criticalFailures: 2,
    databaseErrors: 1,
    severeFrontendErrors: 1
  });
  assert.deepEqual(
    signals.filter((signal) => signal.triggered).map((signal) => signal.code),
    [
      "AUTH_UNAVAILABLE",
      "CRITICAL_API_HIGH_FAILURE_RATE",
      "DATABASE_UNAVAILABLE",
      "SEVERE_FRONTEND_ERROR"
    ]
  );
});

test("alert rules avoid low-volume high-failure-rate noise", () => {
  const signals = evaluateAlertSnapshot({
    windowMinutes: 5,
    authRequests: 1,
    authFailures: 1,
    criticalRequests: 1,
    criticalFailures: 1,
    databaseErrors: 0,
    severeFrontendErrors: 0
  });
  assert.equal(signals.some((signal) => signal.triggered), false);
});

test("monitor outage does not throw or claim delivery", async () => {
  configureMonitoringProvider({
    name: "failing-test-provider",
    capture() {
      throw new Error("SDK_UNAVAILABLE token=should-not-leak");
    }
  });
  const result = await captureMonitorEvent({
    kind: "alert",
    name: "DATABASE_UNAVAILABLE",
    message: "database unavailable",
    level: "fatal",
    tags: { drill: "true" },
    context: {}
  });
  configureMonitoringProvider(null);
  assert.equal(result.captured, false);
  assert.equal(result.provider, "failing-test-provider");
});
