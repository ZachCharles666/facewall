import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NextRequest } from "next/server";

import { middleware as previewAuthMiddleware } from "../../middleware";

const root = process.cwd();
const read = (path: string) => readFile(`${root}/${path}`, "utf8");

test("temporary preview basic auth protects only Classic/Figma and keeps Juju/admin separate", async () => {
  const [middleware, env, decisions, contract] = await Promise.all([
    read("middleware.ts"),
    read(".env.example"),
    read("docs/internal-beta/01_scope_and_decisions.md"),
    read("docs/internal-beta/02_internal_test_contract.md")
  ]);

  assert.match(middleware, /PREVIEW_BASIC_AUTH_ENABLED !== "true"/);
  assert.match(middleware, /PREVIEW_BASIC_AUTH_USERNAME/);
  assert.match(middleware, /PREVIEW_BASIC_AUTH_PASSWORD/);
  assert.match(middleware, /status: 503/);
  assert.match(middleware, /status: 401/);
  assert.match(middleware, /WWW-Authenticate/);
  assert.match(middleware, /request\.nextUrl\.pathname === HEALTH_PATH/);
  assert.match(middleware, /BASIC_AUTH_THEMES = new Set\(\["classic", "figma"\]\)/);
  assert.match(middleware, /request\.nextUrl\.pathname !== "\/"/);
  assert.match(middleware, /BASIC_AUTH_THEMES\.has\(request\.nextUrl\.searchParams\.get\("theme"\)/);
  assert.match(middleware, /request\.nextUrl\.pathname === PROMPT_ADMIN_PATH/);
  assert.match(middleware, /!requiresPreviewBasicAuth\(request\)/);
  assert.doesNotMatch(middleware, /BASIC_AUTH_THEMES.*juju/);
  assert.doesNotMatch(middleware, /product\s*[:=,]\s*["']?product/i);
  assert.match(env, /^PREVIEW_BASIC_AUTH_ENABLED=false$/m);
  assert.match(env, /^PREVIEW_BASIC_AUTH_USERNAME=$/m);
  assert.match(env, /^PREVIEW_BASIC_AUTH_PASSWORD=$/m);
  assert.match(decisions, /D-20/);
  assert.match(contract, /共享预览凭据不产生应用用户/);

  const bundleCheck = await read("scripts/client-bundle-secret-check.mjs");
  assert.match(bundleCheck, /"TOKENHUB_API_KEY"/);
  assert.match(bundleCheck, /"PREVIEW_BASIC_AUTH_USERNAME"/);
  assert.match(bundleCheck, /"PREVIEW_BASIC_AUTH_PASSWORD"/);
});

test("preview basic auth runtime scope leaves Juju and admin outside the shared gate", () => {
  const previous = {
    enabled: process.env.PREVIEW_BASIC_AUTH_ENABLED,
    username: process.env.PREVIEW_BASIC_AUTH_USERNAME,
    password: process.env.PREVIEW_BASIC_AUTH_PASSWORD
  };
  process.env.PREVIEW_BASIC_AUTH_ENABLED = "true";
  process.env.PREVIEW_BASIC_AUTH_USERNAME = "preview-user";
  process.env.PREVIEW_BASIC_AUTH_PASSWORD = "preview-password";

  try {
    const request = (path: string, authorization?: string) =>
      new NextRequest(`https://facewall.example${path}`, {
        headers: authorization ? { authorization } : undefined
      });
    const validAuthorization = `Basic ${Buffer.from(
      "preview-user:preview-password"
    ).toString("base64")}`;

    assert.equal(previewAuthMiddleware(request("/")).status, 200);
    assert.equal(previewAuthMiddleware(request("/?theme=juju")).status, 200);
    assert.equal(previewAuthMiddleware(request("/admin")).status, 200);
    assert.equal(previewAuthMiddleware(request("/api/auth/session")).status, 200);
    assert.equal(previewAuthMiddleware(request("/api/health")).status, 200);
    assert.equal(previewAuthMiddleware(request("/?theme=classic")).status, 401);
    assert.equal(previewAuthMiddleware(request("/?theme=figma")).status, 401);
    assert.equal(previewAuthMiddleware(request("/api/prompts/active")).status, 401);
    assert.equal(
      previewAuthMiddleware(request("/?theme=classic", validAuthorization)).status,
      200
    );

    delete process.env.PREVIEW_BASIC_AUTH_USERNAME;
    assert.equal(previewAuthMiddleware(request("/?theme=figma")).status, 503);
    assert.equal(previewAuthMiddleware(request("/?theme=juju")).status, 200);
  } finally {
    if (previous.enabled === undefined) delete process.env.PREVIEW_BASIC_AUTH_ENABLED;
    else process.env.PREVIEW_BASIC_AUTH_ENABLED = previous.enabled;
    if (previous.username === undefined) delete process.env.PREVIEW_BASIC_AUTH_USERNAME;
    else process.env.PREVIEW_BASIC_AUTH_USERNAME = previous.username;
    if (previous.password === undefined) delete process.env.PREVIEW_BASIC_AUTH_PASSWORD;
    else process.env.PREVIEW_BASIC_AUTH_PASSWORD = previous.password;
  }
});
