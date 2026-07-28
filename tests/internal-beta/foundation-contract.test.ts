import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("auth foundation is passwordless and stores OTP hashes", async () => {
  const config = await read("better-auth.config.ts");
  assert.ok(
    config.includes(`emailAndPassword: {
    enabled: false`)
  );
  assert.match(config, /otpLength:\s*6/);
  assert.match(config, /expiresIn:\s*readOtpExpiresInSec\(\)/);
  assert.match(config, /storeOTP:\s*"hashed"/);
  assert.match(config, /resendStrategy:\s*"rotate"/);
  assert.match(config, /type !== "sign-in"/);
  assert.match(config, /sendOtpEmail\(\{ to: email, code: otp \}\)/);
});

test("runtime auth uses the least-privilege pool and exposes the Better Auth handler", async () => {
  const server = await read("lib/auth/server.ts");
  const pool = await read("lib/db/pool.ts");
  const route = await read("app/api/auth/[...all]/route.ts");

  assert.match(server, /database:\s*getRuntimePool\(\)/);
  assert.doesNotMatch(server, /getAdminPool/);
  assert.match(pool, /-c search_path=auth,public/);
  assert.match(server, /useSecureCookies:\s*process\.env\.NODE_ENV === "production"/);
  assert.match(server, /sendOtpEmail\(\{ to: email, code: otp \}\)/);
  assert.match(server, /export function getAuth\(\)/);
  assert.match(route, /getAuth\(\)\.handler\(request\)/);
  assert.match(route, /toNextJsHandler\(handler\)/);
  assert.match(route, /runtime = "nodejs"/);
});

test("project auth routes close direct Better Auth OTP write endpoints", async () => {
  const route = await read("app/api/auth/[...all]/route.ts");
  const requestRoute = await read("app/api/auth/request-otp/route.ts");
  const redeemRoute = await read("app/api/auth/redeem-invite/route.ts");
  assert.match(route, /request\.method !== "GET"/);
  assert.match(route, /publicReadPaths/);
  assert.match(requestRoute, /reserveOtpSendBudget/);
  assert.doesNotMatch(requestRoute, /inviteCode|check_invite_code/);
  assert.match(redeemRoute, /consumeInviteForUser/);
  assert.match(redeemRoute, /AUTH_REQUIRED/);
});

test("OTP form accepts exactly six ASCII digits without escaped-pattern ambiguity", async () => {
  const gate = await read("components/auth/AuthGate.tsx");
  assert.match(gate, /pattern="\[0-9\]\{6\}"/);
  assert.match(gate, /minLength=\{6\}/);
  assert.match(gate, /maxLength=\{6\}/);
  assert.doesNotMatch(gate, /pattern="\\\\d/);
});

test("admin APIs require a database-backed admin profile", async () => {
  const admin = await read("lib/auth/admin.ts");
  const inviteRoute = await read("app/api/admin/invite-codes/route.ts");
  assert.match(admin, /getAuthProfile/);
  assert.match(admin, /profile\.role !== "admin"/);
  assert.match(inviteRoute, /requireAdmin\(request\)/);
  assert.match(inviteRoute, /plaintextShownOnce:\s*true/);
});

test("business migration has nine forced-RLS tables and no raw audio column", async () => {
  const migration = await read("db/migrations/0002_business_schema.sql");
  const tables = [
    "schools",
    "invite_codes",
    "user_profiles",
    "consent_records",
    "interview_sessions",
    "interview_answers",
    "feedback",
    "product_events",
    "deletion_requests"
  ];
  for (const table of tables) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.ok(migration.includes(`'${table}'`), `${table} missing from RLS loop`);
  }
  assert.match(migration, /force row level security/);
  assert.doesNotMatch(migration, /\baudio_(data|blob|body|bytes)\b/i);
});

test("server secrets are never declared as NEXT_PUBLIC variables", async () => {
  const example = await read(".env.example");
  for (const secret of [
    "DATABASE_URL",
    "DATABASE_ADMIN_URL",
    "BETTER_AUTH_SECRET",
    "TENCENTCLOUD_SECRET_ID",
    "TENCENTCLOUD_SECRET_KEY"
  ]) {
    assert.doesNotMatch(example, new RegExp(`NEXT_PUBLIC_${secret}`));
  }
});
