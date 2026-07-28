import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  isTencentRumEnabled,
  sanitizeRumUrl,
  sanitizeTencentRumClientError,
  sanitizeTencentRumEnvelope
} from "../../lib/observability/tencentRumPolicy";

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
    'hostUrl: "https://rumt-zh.com"',
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
    "apiDetail: true",
    "reportRequest: true",
    "reportAssetSpeed: true",
    "blankScreen: true",
    "injectTraceHeader"
  ]) {
    assert.equal(source.includes(forbidden), false, `unsafe RUM option: ${forbidden}`);
  }
});

test("Tencent RUM public environment example contains no application value", async () => {
  const example = await readFile(".env.example", "utf8");
  assert.match(example, /NEXT_PUBLIC_TENCENT_RUM_ENABLED=false/);
  assert.match(example, /NEXT_PUBLIC_TENCENT_RUM_ID=\r?\n/);
});
