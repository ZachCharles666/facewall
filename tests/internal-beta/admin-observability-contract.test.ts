import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(path, "utf8");

test("observability migration stores only technical metrics and admin audit", async () => {
  const migration = await read("db/migrations/0010_admin_observability.sql");
  assert.match(migration, /create table public\.api_request_metrics/);
  assert.match(migration, /create table public\.admin_audit_logs/);
  assert.match(migration, /force row level security/g);
  assert.match(migration, /public\.app_is_admin\(\)/);
  for (const forbidden of [
    "resume_text",
    "jd_text",
    "answer_text",
    "report jsonb",
    "authorization",
    "cookie"
  ]) {
    assert.equal(migration.toLowerCase().includes(forbidden), false);
  }
});

test("admin metrics use business tables, contract events and technical latency", async () => {
  const source = await read("lib/admin/metrics.ts");
  assert.match(source, /auth\."user"/);
  assert.match(source, /public\.interview_sessions/);
  assert.match(source, /event_name = 'dependency_failed'/);
  assert.match(source, /public\.feedback/);
  assert.match(source, /public\.api_request_metrics/);
  assert.match(source, /percentile_cont\(0\.5\)/);
  assert.match(source, /percentile_cont\(0\.95\)/);
  assert.doesNotMatch(source, /select[\s\S]{0,80}(resume_text|jd_text|answer_text|report)/i);
});

test("admin page and APIs enforce server-side admin authorization", async () => {
  const page = await read("app/admin/page.tsx");
  assert.match(page, /requireAdmin/);
  assert.match(page, /notFound/);
  const routes = [
    "app/api/admin/metrics/route.ts",
    "app/api/admin/schools/route.ts",
    "app/api/admin/invite-codes/route.ts",
    "app/api/admin/deletion-requests/route.ts"
  ];
  for (const route of routes) {
    const source = await read(route);
    assert.match(source, /requireAdmin/);
    assert.match(source, /observeRoute/);
  }
});

test("dangerous admin writes share a transaction with success audit", async () => {
  const operations = await read("lib/admin/operations.ts");
  const deletion = await read("lib/privacy/deletion.ts");
  const bootstrap = await read("scripts/admin-bootstrap.ts");
  assert.match(operations, /withAdminTransaction/);
  assert.match(operations, /insertAdminAudit/);
  assert.match(operations, /invite\.disable/);
  assert.match(operations, /createInviteCodes/);
  assert.match(operations, /batchCount/);
  assert.match(deletion, /action: "deletion\.execute"/);
  assert.match(deletion, /outcome: "succeeded"/);
  assert.match(bootstrap, /role\.promote_admin/);
  assert.match(bootstrap, /begin/);
  assert.match(bootstrap, /commit/);
});

test("admin invite creation supports bounded batches with single-code compatibility", async () => {
  const route = await read("app/api/admin/invite-codes/route.ts");
  const dashboard = await read("components/admin/AdminDashboard.tsx");
  assert.match(route, /batchCount === undefined \? 1/);
  assert.match(route, /batchCount > 100/);
  assert.match(route, /maxUses === undefined \? 1/);
  assert.match(route, /inviteCodes: created/);
  assert.match(dashboard, /name="batchCount"/);
  assert.match(dashboard, /name="maxUses"[\s\S]*defaultValue="1"/);
  assert.match(dashboard, /本批邀请码仅显示一次/);
});

test("dashboard does not render user-authored interview bodies", async () => {
  const dashboard = await read("components/admin/AdminDashboard.tsx");
  for (const forbidden of [
    "resumeText",
    "jdText",
    "answerText",
    "candidateProfile",
    "questionText",
    "optimizedAnswer",
    "copyText"
  ]) {
    assert.equal(dashboard.includes(forbidden), false);
  }
});
