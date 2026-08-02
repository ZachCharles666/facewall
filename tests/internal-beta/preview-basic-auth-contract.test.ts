import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFile(`${root}/${path}`, "utf8");

test("temporary preview basic auth is server-configured, fail-closed, and keeps health anonymous", async () => {
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
  assert.doesNotMatch(middleware, /product\s*[:=,]\s*["']?product/i);
  assert.match(env, /^PREVIEW_BASIC_AUTH_ENABLED=false$/m);
  assert.match(env, /^PREVIEW_BASIC_AUTH_USERNAME=$/m);
  assert.match(env, /^PREVIEW_BASIC_AUTH_PASSWORD=$/m);
  assert.match(decisions, /D-20/);
  assert.match(contract, /共享预览凭据不产生应用用户/);

  const bundleCheck = await read("scripts/client-bundle-secret-check.mjs");
  assert.match(bundleCheck, /"PREVIEW_BASIC_AUTH_USERNAME"/);
  assert.match(bundleCheck, /"PREVIEW_BASIC_AUTH_PASSWORD"/);
});
