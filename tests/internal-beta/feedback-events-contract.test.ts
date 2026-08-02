import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("feedback is owner-bound, report-state-gated, bounded, and idempotent", async () => {
  const service = await read("lib/feedback/feedback.ts");
  assert.match(service, /rating[\s\S]*< 1/);
  assert.match(service, /comment\.length > 500/);
  assert.match(service, /report_ready/);
  assert.match(service, /completed/);
  assert.match(service, /on conflict \(session_id\) do nothing/);
  assert.match(service, /where id = \$1 and user_id = \$2/);
});

test("client events use strict names and property allowlists", async () => {
  const events = await read("lib/analytics/events.ts");
  const route = await read("app/api/events/route.ts");
  assert.match(events, /clientSchemas/);
  assert.match(events, /Object\.keys\(properties\)[\s\S]*clientSchemas/);
  assert.match(events, /source = 'client'|source,\s*idempotency_key/);
  assert.match(route, /requireActiveUser\(request\)/);
  assert.doesNotMatch(route, /payload\.userId|payload\.schoolId/);
});

test("authoritative server event names are written only by server services", async () => {
  const events = await read("lib/analytics/events.ts");
  const migration = await read("db/migrations/0009_feedback_events.sql");
  const persistence = await read("lib/persistence/interviewSessions.ts");
  for (const name of [
    "session_started",
    "profile_generated",
    "questions_generated",
    "answer_saved",
    "report_generated",
    "session_completed",
    "feedback_submitted"
  ]) {
    assert.ok(events.includes(`"${name}"`));
    assert.ok(migration.includes(`'${name}'`));
  }
  assert.match(persistence, /insertSessionEvent/);
});

test("generation measurements propagate without prompt or business bodies", async () => {
  const provider = await read("lib/ai/provider.ts");
  const persistence = await read("lib/persistence/interviewSessions.ts");
  const client = await read("lib/api/client.ts");
  assert.match(provider, /provider[\s\S]*model[\s\S]*latencyMs[\s\S]*usage/);
  assert.match(client, /responseMeasurement/);
  for (const field of [
    "provider",
    "model",
    "latencyMs",
    "attempts",
    "inputTokens",
    "outputTokens",
    "requestId"
  ]) {
    assert.ok(persistence.includes(`${field}: measurement.${field}`));
  }
  assert.match(
    persistence,
    /source !== "llm"[\s\S]*inputTokens !== null[\s\S]*outputTokens !== null/
  );
  assert.doesNotMatch(
    persistence,
    /properties[\s\S]{0,300}(resumeText|jdText|answerText|copyText|promptOverrides)/
  );
});

test("feedback UI is optional and cannot hide report or copy controls", async () => {
  const app = await read("components/InterviewCoachApp.tsx");
  const panel = await read("components/feedback/FeedbackPanel.tsx");
  assert.match(app, /<ReportPanel[\s\S]*<FeedbackPanel/);
  assert.match(panel, /反馈完全自愿/);
  assert.match(panel, /暂时跳过/);
  assert.match(panel, /不影响查看和复制报告/);
});

test("admin feedback summary returns aggregates without comment or user identity", async () => {
  const route = await read("app/api/admin/feedback-summary/route.ts");
  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /avg\(rating\)/);
  assert.doesNotMatch(route, /select[\s\S]*(comment|user_id|session_id)/i);
});
