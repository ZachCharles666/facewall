import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return (await readFile(new URL(`../../${path}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
}

test("all ignored-source runtime image imports remain release-archive inputs", async () => {
  const assets = new Set<string>();
  const ignoreRules = await source(".gitignore");

  async function scan(directory: URL) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) {
        await scan(target);
      } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        const contents = await readFile(target, "utf8");
        for (const match of contents.matchAll(/from\s+["']@\/(面壁者\/[^"']+)["']/g)) {
          assets.add(match[1]);
        }
      }
    }
  }

  await Promise.all([
    scan(new URL("../../app/", import.meta.url)),
    scan(new URL("../../components/", import.meta.url)),
    scan(new URL("../../lib/", import.meta.url))
  ]);
  assert.equal(assets.size, 10);

  for (const asset of assets) {
    await access(new URL(`../../${asset}`, import.meta.url));
    assert.match(ignoreRules, new RegExp(`^!${asset.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, "m"));
  }
});

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

test("Juju replaces unavailable speech input with one bounded notice while Figma keeps fallback editing", async () => {
  const interview = await source("components/interview/InterviewPanel.tsx");
  const apiClient = await source("lib/api/client.ts");
  const prewarm = await source("lib/dev/prewarm.ts");
  const styles = await source("app/globals.css");

  assert.match(interview, /currentAnswer\.sttStatus === "unsupported"/);
  assert.doesNotMatch(interview, /figma-interview-answer juju-interview-manual-answer/);
  assert.match(interview, /aria-label="文字回答"/);
  assert.match(interview, /当前设备无法录音，可直接输入回答/);
  assert.match(interview, /answerText: event\.target\.value/);
  assert.match(interview, /inputMode: "text"/);
  assert.match(interview, /juju-interview-voice-notice-keyword">录制失败/);
  assert.match(interview, /juju-interview-voice-notice-keyword">语音过短/);
  assert.match(interview, /juju-interview-voice-notice-keyword">网络异常/);
  assert.match(interview, /recordedDurationSec <= 2/);
  assert.match(interview, /jujuRecordingAttemptQuestionId !== currentAnswer\.questionId/);
  assert.match(
    interview,
    /showVoiceFailure = !isRecording && !isProcessing && jujuVoiceFailureKind !== null/
  );
  assert.match(interview, /setFigmaAnswerPhase\("prompt"\)/);
  assert.match(interview, /jujuVoiceFailureKind !== "network"/);
  assert.match(interview, /setTimeout\(\(\) => onExitInterview\?\.\(\), 5000\)/);
  assert.match(interview, /ttsPlaybackTokenRef/);
  assert.match(interview, /ttsAbortControllerRef\.current\?\.abort\(\)/);
  assert.match(interview, /playbackToken !== ttsPlaybackTokenRef\.current/);
  assert.match(interview, /providerTimedOut/);
  assert.match(interview, /jujuAdvanceLockRef/);
  assert.match(interview, /正在进入下一步…/);
  assert.match(apiClient, /signal: options\?\.signal/);
  assert.match(prewarm, /"\/api\/tts"/);
  assert.match(prewarm, /"\/api\/azure-status"/);
  assert.match(styles, /\.theme-juju \.juju-interview-question-frame p \{[\s\S]*?color: #4d4d4d;/);
  assert.match(styles, /\.theme-juju \.juju-interview-question-frame \{[\s\S]*?height: 142px;/);
  assert.match(styles, /\.theme-juju \.juju-interview-question-viewport \{[\s\S]*?height: 132px;/);
  assert.match(styles, /\.theme-juju \.juju-interview-voice-notice \{[\s\S]*?color: #4d4d4d;/);
  assert.match(styles, /\.theme-juju \.juju-interview-voice-notice-keyword \{[\s\S]*?color: #cc0000;/);
});

test("Juju preserves answers and retries only a real report instead of masking failures with demo output", async () => {
  const app = await source("components/InterviewCoachApp.tsx");
  const apiClient = await source("lib/api/client.ts");
  const provider = await source("lib/ai/provider.ts");
  const reportGeneration = await source("lib/report/generation.ts");
  const report = await source("components/report/ReportPanel.tsx");

  assert.match(app, /initialVisualTheme === "juju"[\s\S]*?真实复盘报告生成超时或服务暂时不可用/);
  assert.doesNotMatch(app, /initialVisualTheme === "juju"[\s\S]*?handleUseFallbackReport\(reportPayload\.answers/);
  assert.match(apiClient, /signal: handlers\.signal/);
  assert.match(provider, /createTimeoutSignal\(timeoutMs = 25_000, parentSignal\?: AbortSignal\)/);
  assert.match(reportGeneration, /QUESTION_REPORT_CONCURRENCY = 2/);
  assert.match(reportGeneration, /buildQuestionReportPrompt[\s\S]*?buildFinalReportPrompt/);
  assert.match(report, /state\.kind === "error" && visualTheme !== "juju"/);
  assert.match(report, /state\.kind === "error" && visualTheme === "juju"[\s\S]*?重新生成真实报告/);
});

test("Juju enters loading before quota, persistence, profile, and report work begins", async () => {
  const app = await source("components/InterviewCoachApp.tsx");

  assert.match(
    app,
    /setProfileGenerationPending\(true\)[\s\S]*?正在检查面试额度并生成候选人画像[\s\S]*?await ensurePersistedSession\(nextForm\)/
  );
  assert.match(
    app,
    /setStep\("report"\)[\s\S]*?正在保存答案并启动真实复盘报告[\s\S]*?await persistAnswersNow\(nextAnswers\)/
  );
});

test("Juju turns exhausted interview quota into a blocking 3/3 dialog after entering loading", async () => {
  const app = await source("components/InterviewCoachApp.tsx");
  const styles = await source("app/globals.css");

  assert.match(app, /error instanceof ApiClientError && error\.code === "SESSION_QUOTA_EXHAUSTED"/);
  assert.match(app, /模拟面试额度已用完/);
  assert.match(app, /你已完成 3\/3 次模拟面试/);
  assert.ok(
    app.indexOf("setProfileGenerationPending(true)", app.indexOf("async function handleParseProfile")) <
      app.indexOf("await ensurePersistedSession(nextForm)")
  );
  assert.match(styles, /\.theme-juju \.juju-quota-dialog-overlay/);
  assert.match(styles, /\.theme-juju \.juju-quota-dialog/);
});

test("TTS and STT development faults are independently injectable", async () => {
  const devOps = await source("lib/dev/ops.ts");
  const ttsRoute = await source("app/api/tts/route.ts");
  const sttRoute = await source("app/api/stt/route.ts");

  assert.match(devOps, /"tts"\s*\|\s*"stt"/);
  assert.match(ttsRoute, /shouldInjectDevFault\(request,\s*"tts"\)/);
  assert.match(sttRoute, /shouldInjectDevFault\(request,\s*"stt"\)/);
  assert.doesNotMatch(sttRoute, /shouldInjectDevFault\(request,\s*"tts"\)/);
});
