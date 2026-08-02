import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { configureMonitoringProvider, captureMonitorEvent } from "../../lib/observability/monitor";
import { observeRoute } from "../../lib/observability/route";
import { scrubTelemetry } from "../../lib/observability/scrub";
import { okResponse } from "../../lib/schemas/contracts";

test("scrubber removes credentials, OTP and user-authored bodies recursively", () => {
  const scrubbed = scrubTelemetry({
    headers: {
      Authorization: "Bearer should-not-survive",
      Cookie: "session=should-not-survive"
    },
    resumeText: "private resume",
    nested: {
      answerText: "private answer",
      url: "https://example.test/callback?token=secret-value",
      message: "otp=123456"
    }
  });
  const serialized = JSON.stringify(scrubbed);
  for (const forbidden of [
    "should-not-survive",
    "private resume",
    "private answer",
    "secret-value",
    "123456"
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(serialized.includes("[REDACTED]"), true);
  assert.equal(serialized.includes("[USER_CONTENT_OMITTED]"), true);
});

test("monitor adapter receives only scrubbed payloads", async () => {
  const captured: unknown[] = [];
  configureMonitoringProvider({
    name: "test-provider",
    capture(event) {
      captured.push(event);
    }
  });
  const result = await captureMonitorEvent({
    kind: "exception",
    name: "TestError",
    message: "token=secret-token otp=123456",
    level: "error",
    tags: { runtime: "test" },
    context: { jdText: "private jd", Cookie: "private cookie" }
  });
  configureMonitoringProvider(null);
  assert.equal(result.captured, true);
  const serialized = JSON.stringify(captured);
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("123456"), false);
  assert.equal(serialized.includes("private jd"), false);
  assert.equal(serialized.includes("private cookie"), false);
});

test("observed route correlates response body and header requestId", async () => {
  const request = new Request("http://localhost/api/test", {
    method: "GET",
    headers: { "x-request-id": "trace-test-123456" }
  });
  const response = await observeRoute(
    request,
    { route: "/api/test", persistMetric: false },
    async () => Response.json(okResponse({ ok: true }))
  );
  const body = await response.json();
  assert.equal(response.headers.get("x-request-id"), "trace-test-123456");
  assert.equal(body.requestId, "trace-test-123456");
});

async function routeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return routeFiles(fullPath);
      return entry.name === "route.ts" ? [fullPath] : [];
    })
  );
  return nested.flat();
}

test("all project API routes use request observability except the raw Better Auth handler", async () => {
  const files = await routeFiles("app/api");
  const uncovered: string[] = [];
  for (const file of files) {
    if (file.includes(`${path.sep}auth${path.sep}[...all]${path.sep}`)) continue;
    const source = await readFile(file, "utf8");
    if (!source.includes("observeRoute")) uncovered.push(file);
  }
  assert.deepEqual(uncovered, []);
});
