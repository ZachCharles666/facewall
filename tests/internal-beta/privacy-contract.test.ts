import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("current privacy policy is server-owned and marked as pre-freeze copy", async () => {
  const policy = await read("lib/privacy/policy.ts");
  const route = await read("app/api/consent/accept/route.ts");
  assert.match(policy, /version:\s*"2026-07"/);
  assert.match(policy, /待产品\/法务冻结/);
  assert.match(policy, /不保存原始音频/);
  assert.match(route, /acceptCurrentConsent/);
  assert.doesNotMatch(route, /CURRENT_PRIVACY_POLICY\s*=/);
});

test("consent acceptance validates current version, scopes, and idempotency", async () => {
  const service = await read("lib/privacy/consent.ts");
  const migration = await read("db/migrations/0008_consent_and_deletion.sql");
  assert.match(service, /POLICY_VERSION_OUTDATED/);
  assert.match(service, /sameScopes\(input\.scopes\)/);
  assert.match(service, /on conflict \(user_id, policy_version\) do nothing/);
  assert.match(migration, /consent_records_owner_read/);
  assert.match(migration, /consent_records_owner_insert/);
  assert.doesNotMatch(migration, /for update[\s\S]*consent_records/i);
});

test("auth UI and session creation both enforce current consent", async () => {
  const gate = await read("components/auth/AuthGate.tsx");
  const sessionRoute = await read("app/api/auth/session/route.ts");
  const persistence = await read("lib/persistence/interviewSessions.ts");
  assert.match(gate, /needsConsent/);
  assert.match(gate, /\/api\/consent\/accept/);
  assert.match(sessionRoute, /getCurrentConsent/);
  assert.match(persistence, /CURRENT_PRIVACY_POLICY\.version/);
  assert.match(persistence, /isConsentGateEnabled\(\)/);
});

test("deletion execution is admin-only, transactional, retryable, and clears identity", async () => {
  const service = await read("lib/privacy/deletion.ts");
  const executeRoute = await read(
    "app/api/admin/deletion-requests/[requestId]/execute/route.ts"
  );
  assert.match(executeRoute, /requireAdmin\(request\)/);
  assert.match(service, /status = 'deletion_pending'/);
  assert.match(service, /status = 'failed'/);
  assert.match(service, /delete from auth\."user"/);
  assert.match(service, /set user_id = null, status = 'completed'/);
  assert.doesNotMatch(service, /resume_text|jd_text|answer_text|report/);
});

test("deletion audit relation can survive identity deletion without a user mapping", async () => {
  const migration = await read("db/migrations/0008_consent_and_deletion.sql");
  assert.match(migration, /alter column user_id drop not null/);
  assert.match(migration, /on delete set null/);
  assert.match(migration, /deletion_requests_user_active_idx/);
});
