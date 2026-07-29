import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  isTencentRumEnabled,
  sanitizeRumUrl,
  sanitizeTencentRumClientError,
  sanitizeTencentRumEnvelope
} from "../../lib/observability/tencentRumPolicy";
import { lockTencentRumEndpoints } from "../../lib/observability/tencentRum";

test("Tencent RUM remains fail-off without an exact enable flag and valid application ID", () => {
  assert.equal(isTencentRumEnabled(undefined, undefined), false);
  assert.equal(isTencentRumEnabled("false", "valid-rum-id"), false);
  assert.equal(isTencentRumEnabled("TRUE", "valid-rum-id"), false);
  assert.equal(isTencentRumEnabled("true", "short"), false);
  assert.equal(isTencentRumEnabled("true", "valid-rum-id"), true);
});

test("Tencent RUM URL policy removes query, hash and dynamic identifiers", () => {
  assert.equal(
    sanitizeRumUrl(
      "https://facewall.example/api/interview-sessions/3f73ac12-3f24-4e1a-8dd7-6c61edb10f47?token=private#answer"
    ),
    "/api/interview-sessions/:id"
  );
  assert.equal(
    sanitizeRumUrl("/api/items/123456?email=private@example.com"),
    "/api/items/:id"
  );
});

test("Tencent RUM metric policy omits user content and keeps only a valid requestId correlation", () => {
  const sanitized = sanitizeTencentRumEnvelope({
    logType: "speed",
    logs: {
      url: "https://facewall.example/api/report?token=private",
      method: "POST",
      status: 500,
      duration: 123,
      payload: {
        requestBody: { resumeText: "private resume" },
        responseBody: { report: "private report" },
        headers: {
          authorization: "Bearer private",
          "x-request-id": "req-rum-contract-123"
        }
      },
      email: "student@example.edu"
    }
  });
  assert.notEqual(sanitized, false);
  const serialized = JSON.stringify(sanitized);
  assert.equal(serialized.includes("private"), false);
  assert.equal(serialized.includes("student@example.edu"), false);
  assert.equal(serialized.includes("?"), false);
  assert.equal(serialized.includes("req-rum-contract-123"), true);
});

test("Tencent RUM metric policy preserves batched API speed records without mixing requestIds", () => {
  const sanitized = sanitizeTencentRumEnvelope({
    logType: "speed",
    logs: [
      {
        url: "https://facewall.example/api/auth/session?theme=juju",
        method: "GET",
        status: 401,
        duration: 37,
        response: {
          headers: {
            "x-request-id": "req-rum-batch-0001",
            authorization: "Bearer private"
          },
          body: {
            email: "student@example.edu"
          }
        }
      },
      {
        url: "https://facewall.example/api/health?secret=private",
        method: "GET",
        status: 200,
        duration: 12,
        response: {
          headers: {
            "x-request-id": "req-rum-batch-0002"
          }
        }
      }
    ]
  });
  assert.notEqual(sanitized, false);
  if (sanitized === false) return;
  assert.equal(Array.isArray(sanitized.logs), true);
  assert.equal((sanitized.logs as unknown[]).length, 2);
  const serialized = JSON.stringify(sanitized);
  assert.equal(serialized.includes("/api/auth/session"), true);
  assert.equal(serialized.includes("/api/health"), true);
  assert.equal(serialized.includes("?"), false);
  assert.equal(serialized.includes("req-rum-batch-0001"), true);
  assert.equal(serialized.includes("req-rum-batch-0002"), true);
  assert.equal(serialized.includes("private"), false);
  assert.equal(serialized.includes("student@example.edu"), false);
});

test("Tencent RUM metric policy drops empty metric batches", () => {
  assert.equal(
    sanitizeTencentRumEnvelope({
      logType: "speed",
      logs: [{ payload: { resumeText: "private resume" } }]
    }),
    false
  );
});

test("Tencent RUM error policy drops error text and keeps sanitized stack frames", () => {
  const sanitized = sanitizeTencentRumClientError({
    name: "TypeError",
    source: "window-error",
    path: "/interview/123456?answer=private",
    stack:
      "TypeError: candidate private answer\n    at submit (https://facewall.example/_next/app.js?token=private:1:2)"
  });
  const serialized = JSON.stringify(sanitized);
  assert.equal(sanitized.name, "TypeError");
  assert.equal(sanitized.path, "/interview/:id");
  assert.equal(serialized.includes("candidate private answer"), false);
  assert.equal(serialized.includes("token=private"), false);
  assert.equal(serialized.includes("/_next/app.js"), true);
});

test("Tencent RUM adapter locks privacy-sensitive SDK switches off", async () => {
  const source = await readFile("lib/observability/tencentRum.ts", "utf8");
  for (const required of [
    'const TENCENT_RUM_HOST = "https://rumt-zh.com"',
    "hostUrl: TENCENT_RUM_HOST",
    "lockTencentRumEndpoints(instance)",
    'uin: "anonymous"',
    "aid: false",
    "device: false",
    'whiteListUrl: ""',
    "onError: false",
    "consoleLog: false",
    "clickElementLog: false",
    "reportAssetSpeed: false",
    "blankScreen: false",
    "apiDetail: false",
    "reportRequest: false",
    'resHeaders: ["x-request-id"]'
  ]) {
    assert.equal(source.includes(required), true, `missing privacy lock: ${required}`);
  }
  for (const forbidden of [
    'rateLimitUrl: `${TENCENT_RUM_HOST}/collect/rateConfig`',
    "apiDetail: true",
    "reportRequest: true",
    "reportAssetSpeed: true",
    "blankScreen: true",
    "injectTraceHeader"
  ]) {
    assert.equal(source.includes(forbidden), false, `unsafe RUM option: ${forbidden}`);
  }
});

test("Tencent RUM endpoint policy overrides SDK-derived endpoints after construction", () => {
  let applied: Record<string, unknown> | undefined;
  lockTencentRumEndpoints({
    setConfig(config) {
      applied = config;
      return config as never;
    }
  });

  assert.deepEqual(applied, {
    url: "https://rumt-zh.com/collect",
    pvUrl: "https://rumt-zh.com/collect/pv",
    whiteListUrl: "",
    eventUrl: "",
    speedUrl: "https://rumt-zh.com/speed",
    customTimeUrl: "",
    performanceUrl: "https://rumt-zh.com/speed/performance",
    webVitalsUrl: "https://rumt-zh.com/speed/webvitals",
    rateLimitUrl: "https://rumt-zh.com/rateConfig",
    offlineUrl: ""
  });
});

test("Tencent RUM public environment example contains no application value", async () => {
  const example = await readFile(".env.example", "utf8");
  assert.match(example, /NEXT_PUBLIC_TENCENT_RUM_ENABLED=false/);
  assert.match(example, /NEXT_PUBLIC_TENCENT_RUM_ID=\r?\n/);
});
