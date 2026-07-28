import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("session create migration locks quota, rechecks idempotency, and writes one server event", async () => {
  const migration = await source("db/migrations/0006_interview_persistence.sql");
  const lockIndex = migration.indexOf("for update;");
  const recheckIndex = migration.indexOf(
    "where user_id = p_user_id\n     and idempotency_key = p_idempotency_key;",
    lockIndex
  );
  const quotaIndex = migration.indexOf(
    "selected_profile.sessions_started >= selected_profile.session_limit"
  );
  const insertIndex = migration.indexOf(
    "insert into public.interview_sessions",
    quotaIndex
  );
  const incrementIndex = migration.indexOf(
    "set sessions_started = sessions_started + 1",
    insertIndex
  );
  const eventIndex = migration.indexOf(
    "'session_started', 'server'",
    incrementIndex
  );

  assert.ok(lockIndex > 0);
  assert.ok(recheckIndex > lockIndex);
  assert.ok(quotaIndex > recheckIndex);
  assert.ok(insertIndex > quotaIndex);
  assert.ok(incrementIndex > insertIndex);
  assert.ok(eventIndex > incrementIndex);
  assert.match(
    migration,
    /unique index interview_sessions_user_idempotency_idx/
  );
});

test("persistence API surface is owner-derived and never accepts raw audio", async () => {
  const createRoute = await source("app/api/interview-sessions/route.ts");
  const answerRoute = await source(
    "app/api/interview-sessions/[sessionId]/answers/[questionId]/route.ts"
  );
  const repository = await source(
    "lib/persistence/interviewSessions.ts"
  );

  assert.match(createRoute, /requireActiveUser\(request\)/);
  assert.doesNotMatch(createRoute, /payload\.userId|payload\.schoolId/);
  assert.match(answerRoute, /answerText/);
  assert.doesNotMatch(
    `${createRoute}\n${answerRoute}\n${repository}`,
    /audioBlob|audioData|audioUrl|rawAudio/
  );
  assert.match(repository, /SESSION_CONFLICT/);
  assert.match(repository, /INVALID_STATE_TRANSITION/);
  assert.match(repository, /question\.id === input\.questionId/);
});

test("client restores a database snapshot while keeping React answers as editable draft", async () => {
  const app = await source("components/InterviewCoachApp.tsx");
  assert.match(app, /getCurrentPersistedInterviewSession/);
  assert.match(app, /getPersistedInterviewSession/);
  assert.match(app, /applyPersistedSnapshot/);
  assert.match(app, /答案保存失败，当前输入仍保留在页面中/);
  assert.match(app, /initialPersistenceMode/);
});

test("figma and juju preserve a manual answer path when speech input is unavailable", async () => {
  const interview = await source("components/interview/InterviewPanel.tsx");

  assert.match(interview, /currentAnswer\.sttStatus === "unsupported"/);
  assert.match(interview, /figma-interview-answer juju-interview-manual-answer/);
  assert.match(interview, /aria-label="文字回答"/);
  assert.match(interview, /当前设备无法录音，可直接输入回答/);
  assert.match(interview, /answerText: event\.target\.value/);
  assert.match(interview, /inputMode: "text"/);
  assert.match(interview, /输入后点击中间按钮继续/);
});
