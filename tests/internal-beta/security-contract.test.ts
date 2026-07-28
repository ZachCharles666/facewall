import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("auth, feedback, event and admin writes use the shared request guard", async () => {
  const requiredJsonRoutes = [
    "app/api/auth/request-otp/route.ts",
    "app/api/auth/verify-otp/route.ts",
    "app/api/auth/redeem-invite/route.ts",
    "app/api/events/route.ts",
    "app/api/interview-sessions/[sessionId]/feedback/route.ts",
    "app/api/admin/schools/route.ts",
    "app/api/admin/invite-codes/route.ts"
  ];
  for (const route of requiredJsonRoutes) {
    const source = await read(route);
    assert.match(source, /writeSecurity/);
    assert.match(source, /body:\s*"json"/);
    assert.match(source, /maxBodyBytes/);
    assert.match(source, /limit/);
    assert.match(source, /windowSeconds/);
  }

  for (const route of [
    "app/api/auth/logout/route.ts",
    "app/api/admin/deletion-requests/[requestId]/approve/route.ts",
    "app/api/admin/deletion-requests/[requestId]/execute/route.ts"
  ]) {
    const source = await read(route);
    assert.match(source, /writeSecurity/);
    assert.match(source, /body:\s*"none"/);
  }

  const alertRoute = await read("app/api/admin/alerts/evaluate/route.ts");
  assert.match(alertRoute, /body:\s*"optional-json"/);
});

test("write request guard bounds streamed bodies and stores only HMAC scope", async () => {
  const source = await read("lib/security/writeRequest.ts");
  const migration = await read("db/migrations/0011_write_rate_limits.sql");
  assert.match(source, /request\.clone\(\)\.body\?\.getReader\(\)/);
  assert.match(source, /total > maxBodyBytes/);
  assert.match(source, /createHmac\("sha256"/);
  assert.match(source, /RATE_LIMITED/);
  assert.match(source, /SECURITY_DEPENDENCY_FAILED/);
  assert.match(migration, /create table auth\.write_rate_limit_counters/);
  assert.match(migration, /security definer/);
  assert.match(migration, /revoke all on table auth\.write_rate_limit_counters from public/);
  assert.doesNotMatch(migration, /\b(email|cookie|authorization|token|otp)\b/i);
});

test("admin role mutation is confined to the server bootstrap flow", async () => {
  const bootstrap = await read("scripts/admin-bootstrap.ts");
  assert.match(bootstrap, /DATABASE_ADMIN_URL/);
  assert.match(bootstrap, /set role = 'admin'/);
  assert.match(bootstrap, /role\.promote_admin/);
  assert.match(bootstrap, /server_bootstrap/);

  const applicationFiles = [
    "app/api/admin/schools/route.ts",
    "app/api/admin/invite-codes/route.ts",
    "app/api/admin/metrics/route.ts",
    "app/api/auth/redeem-invite/route.ts",
    "lib/auth/profile.ts"
  ];
  for (const file of applicationFiles) {
    assert.doesNotMatch(await read(file), /set\s+role\s*=\s*['"]admin['"]/i);
  }
});

test("CommonResponse and stable question/style identifiers remain contract-owned", async () => {
  const schema = await read("lib/schemas/contracts.ts");
  const types = await read("lib/types.ts");
  const smoke = await read("scripts/contract-smoke.mjs");
  assert.match(schema, /ok:\s*true/);
  assert.match(schema, /error:\s*null/);
  assert.match(schema, /requestId:/);
  assert.match(schema, /strictHr/);
  assert.match(schema, /techBro/);
  assert.match(schema, /gentleSister/);
  assert.match(types, /questionId:/);
  assert.match(smoke, /q1,q2,q3/);
  assert.match(smoke, /report stream events/);
  assert.match(smoke, /single question regenerate/);
});
