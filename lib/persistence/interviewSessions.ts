import "server-only";

import type { PoolClient } from "pg";

import { insertServerEvent } from "@/lib/analytics/events";
import { isConsentGateEnabled } from "@/lib/config/internalBeta";
import { withUserTransaction } from "@/lib/db/context";
import { CURRENT_PRIVACY_POLICY } from "@/lib/privacy/policy";
import {
  validateCandidateProfile,
  validateQuestions,
  validateReport
} from "@/lib/schemas/contracts";
import type {
  CandidateProfile,
  GenerationMeasurement,
  GenerationSource,
  InterviewAnswer,
  InterviewQuestion,
  InterviewReport,
  InterviewSessionSnapshot,
  InterviewerStyleId,
  PersistedSessionStatus,
  SessionQuota
} from "@/lib/types";

const SESSION_SCHEMA_VERSION = 1;
const sources = new Set<GenerationSource>(["llm", "demo_fallback", "mixed"]);
const statusRank: Record<PersistedSessionStatus, number> = {
  draft: 0,
  profile_ready: 1,
  questions_ready: 2,
  in_progress: 3,
  report_ready: 4,
  completed: 5,
  abandoned: 5
};

function normalizeMeasurement(
  value: GenerationMeasurement | undefined,
  source: GenerationSource
): GenerationMeasurement {
  const fallback: GenerationMeasurement = {
    source,
    provider: source === "demo_fallback" ? "local_demo" : null,
    model: null,
    latencyMs: null,
    attempts: null,
    inputTokens: null,
    outputTokens: null,
    requestId: null
  };
  if (!value) return fallback;
  const safeString = (item: unknown, max: number) =>
    item === null ||
    (typeof item === "string" &&
      item.length > 0 &&
      item.length <= max &&
      !/[\r\n]/.test(item));
  const safeCount = (item: unknown) =>
    item === null ||
    (Number.isSafeInteger(item) && Number(item) >= 0);
  if (
    value.source !== source ||
    !safeString(value.provider, 128) ||
    !safeString(value.model, 128) ||
    !safeCount(value.latencyMs) ||
    !safeCount(value.attempts) ||
    !safeCount(value.inputTokens) ||
    !safeCount(value.outputTokens) ||
    !safeString(value.requestId, 128) ||
    (value.requestId !== null &&
      !/^[a-zA-Z0-9._:-]{8,128}$/.test(value.requestId)) ||
    (source !== "llm" &&
      (value.inputTokens !== null ||
        value.outputTokens !== null ||
        value.latencyMs !== null ||
        value.attempts !== null ||
        value.model !== null)) ||
    (source === "demo_fallback" && value.provider !== "local_demo")
  ) {
    throw new InterviewPersistenceError("INPUT_INVALID", 400);
  }
  return value;
}

export class InterviewPersistenceError extends Error {
  constructor(
    public readonly code:
      | "AUTH_REQUIRED"
      | "ACCOUNT_UNAVAILABLE"
      | "CONSENT_REQUIRED"
      | "INPUT_INVALID"
      | "RESOURCE_NOT_FOUND"
      | "SESSION_CONFLICT"
      | "INVALID_STATE_TRANSITION"
      | "SESSION_QUOTA_EXHAUSTED"
      | "PERSISTENCE_DISABLED"
      | "PERSISTENCE_FAILED",
    public readonly status: 400 | 401 | 403 | 404 | 409 | 500 | 503,
    public readonly retryable = false,
    public readonly currentVersion?: number
  ) {
    super(code);
  }
}

function asPersistenceError(error: unknown): InterviewPersistenceError {
  if (error instanceof InterviewPersistenceError) return error;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("SESSION_QUOTA_EXHAUSTED")) {
    return new InterviewPersistenceError("SESSION_QUOTA_EXHAUSTED", 409);
  }
  if (message.includes("CONSENT_REQUIRED")) {
    return new InterviewPersistenceError("CONSENT_REQUIRED", 403);
  }
  if (message.includes("ACCOUNT_UNAVAILABLE")) {
    return new InterviewPersistenceError("ACCOUNT_UNAVAILABLE", 403);
  }
  if (message.includes("AUTH_REQUIRED")) {
    return new InterviewPersistenceError("AUTH_REQUIRED", 401);
  }
  const databaseCode =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "unknown";
  console.error(
    "[persistence]",
    JSON.stringify({ operation: "database", code: databaseCode })
  );
  return new InterviewPersistenceError("PERSISTENCE_FAILED", 500, true);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isGenerationSource(value: unknown): value is GenerationSource {
  return typeof value === "string" && sources.has(value as GenerationSource);
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function loadSnapshot(
  client: PoolClient,
  userId: string,
  selector: { sessionId: string } | { current: true }
): Promise<InterviewSessionSnapshot | null> {
  const where =
    "sessionId" in selector
      ? "s.id = $2"
      : "s.status not in ('completed', 'abandoned')";
  const params = "sessionId" in selector ? [userId, selector.sessionId] : [userId];
  const result = await client.query(
    `select s.*
       from public.interview_sessions s
      where s.user_id = $1 and ${where}
      order by s.created_at desc
      limit 1`,
    params
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const candidateProfile = row.candidate_profile;
  const questions = row.questions;
  const report = row.report;
  if (candidateProfile !== null && !validateCandidateProfile(candidateProfile)) {
    throw new InterviewPersistenceError("PERSISTENCE_FAILED", 500);
  }
  if (questions !== null && !validateQuestions(questions)) {
    throw new InterviewPersistenceError("PERSISTENCE_FAILED", 500);
  }
  if (report !== null && !validateReport(report)) {
    throw new InterviewPersistenceError("PERSISTENCE_FAILED", 500);
  }

  const answerResult = await client.query(
    `select question_id, answer_text, input_mode, duration_sec, stt_status
       from public.interview_answers
      where session_id = $1 and user_id = $2
      order by created_at`,
    [row.id, userId]
  );
  const answers: InterviewAnswer[] = answerResult.rows.map((answer) => ({
    questionId: String(answer.question_id),
    answerText: String(answer.answer_text),
    inputMode: answer.input_mode,
    durationSec: Number(answer.duration_sec),
    sttStatus: answer.stt_status
  }));

  return {
    sessionId: String(row.id),
    status: row.status as PersistedSessionStatus,
    version: Number(row.version),
    schemaVersion: Number(row.schema_version),
    resumeText: String(row.resume_text),
    jdText: String(row.jd_text),
    interviewerStyleId: row.interviewer_style_id as InterviewerStyleId,
    candidateProfile: (candidateProfile as CandidateProfile | null) ?? null,
    questions: (questions as InterviewQuestion[] | null) ?? [],
    answers,
    report: (report as InterviewReport | null) ?? null,
    generationSource: row.generation_source as GenerationSource,
    createdAt: toIso(row.created_at as Date | string),
    updatedAt: toIso(row.updated_at as Date | string)
  };
}

export async function createInterviewSession(input: {
  userId: string;
  resumeText: string;
  jdText: string;
  interviewerStyleId: InterviewerStyleId;
  idempotencyKey: string;
}) {
  if (!isUuid(input.idempotencyKey)) {
    throw new InterviewPersistenceError("INPUT_INVALID", 400);
  }
  try {
    return await withUserTransaction(input.userId, async (client) => {
      const result = await client.query(
        `select *
           from public.create_interview_session($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.userId,
          input.resumeText,
          input.jdText,
          input.interviewerStyleId,
          input.idempotencyKey,
          CURRENT_PRIVACY_POLICY.version,
          isConsentGateEnabled()
        ]
      );
      const row = result.rows[0];
      if (!row) throw new Error("PERSISTENCE_FAILED");
      const quota: SessionQuota = {
        limit: Number(row.quota_limit),
        used: Number(row.quota_used),
        remaining: Math.max(0, Number(row.quota_limit) - Number(row.quota_used))
      };
      return {
        sessionId: String(row.session_id),
        status: row.session_status as PersistedSessionStatus,
        version: Number(row.session_version),
        quota
      };
    });
  } catch (error) {
    throw asPersistenceError(error);
  }
}

export async function getInterviewSession(userId: string, sessionId: string) {
  if (!isUuid(sessionId)) throw new InterviewPersistenceError("RESOURCE_NOT_FOUND", 404);
  return withUserTransaction(userId, async (client) => {
    const snapshot = await loadSnapshot(client, userId, { sessionId });
    if (!snapshot) throw new InterviewPersistenceError("RESOURCE_NOT_FOUND", 404);
    return snapshot;
  });
}

export async function getCurrentInterviewSession(userId: string) {
  return withUserTransaction(userId, (client) => loadSnapshot(client, userId, { current: true }));
}

async function lockSession(client: PoolClient, userId: string, sessionId: string) {
  const result = await client.query(
    `select *
       from public.interview_sessions
      where id = $1 and user_id = $2
      for update`,
    [sessionId, userId]
  );
  if (!result.rows[0]) throw new InterviewPersistenceError("RESOURCE_NOT_FOUND", 404);
  return result.rows[0] as Record<string, unknown>;
}

function assertVersion(row: Record<string, unknown>, expectedVersion: number, idempotentStatus?: PersistedSessionStatus) {
  const currentVersion = Number(row.version);
  if (currentVersion === expectedVersion) return;
  if (idempotentStatus && row.status === idempotentStatus && currentVersion === expectedVersion + 1) return;
  throw new InterviewPersistenceError("SESSION_CONFLICT", 409, true, currentVersion);
}

async function insertSessionEvent(
  client: PoolClient,
  row: Record<string, unknown>,
  eventName:
    | "profile_generated"
    | "questions_generated"
    | "answer_saved"
    | "report_generated"
    | "session_completed",
  idempotencyKey: string,
  properties: Record<string, string | number | boolean | null>
) {
  await insertServerEvent(client, {
    userId: String(row.user_id),
    schoolId: String(row.school_id),
    sessionId: String(row.id),
    eventName,
    idempotencyKey,
    properties
  });
}

export async function saveSessionMilestone(input: {
  userId: string;
  sessionId: string;
  expectedVersion: number;
  milestone: "profile_ready" | "questions_ready";
  candidateProfile?: CandidateProfile;
  questions?: InterviewQuestion[];
  generationSource: GenerationSource;
  measurement?: GenerationMeasurement;
  idempotencyKey: string;
  databaseFault?: boolean;
}) {
  if (!isUuid(input.sessionId) || !isUuid(input.idempotencyKey) || !isGenerationSource(input.generationSource)) {
    throw new InterviewPersistenceError("INPUT_INVALID", 400);
  }
  if (
    (input.milestone === "profile_ready" && !validateCandidateProfile(input.candidateProfile)) ||
    (input.milestone === "questions_ready" && !validateQuestions(input.questions))
  ) {
    throw new InterviewPersistenceError("INPUT_INVALID", 400);
  }
  const measurement = normalizeMeasurement(
    input.measurement,
    input.generationSource
  );
  return withUserTransaction(input.userId, async (client) => {
    if (input.databaseFault) {
      await client.query("set local statement_timeout = '1ms'");
      await client.query("select pg_sleep(0.05)");
    }
    const row = await lockSession(client, input.userId, input.sessionId);
    assertVersion(row, input.expectedVersion, input.milestone);
    if (row.status === input.milestone) {
      return (await loadSnapshot(client, input.userId, { sessionId: input.sessionId }))!;
    }
    const expectedPrevious = input.milestone === "profile_ready" ? "draft" : "profile_ready";
    if (row.status !== expectedPrevious) {
      throw new InterviewPersistenceError("INVALID_STATE_TRANSITION", 409);
    }
    const field = input.milestone === "profile_ready" ? "candidate_profile" : "questions";
    const value = input.milestone === "profile_ready" ? input.candidateProfile : input.questions;
    const sourceExpression =
      input.milestone === "profile_ready"
        ? "$3"
        : "case when generation_source = $3 then $3 else 'mixed' end";
    await client.query(
      `update public.interview_sessions
          set ${field} = $1::jsonb,
              status = $2,
              generation_source = ${sourceExpression},
              version = version + 1
        where id = $4 and user_id = $5`,
      [JSON.stringify(value), input.milestone, input.generationSource, input.sessionId, input.userId]
    );
    await insertSessionEvent(
      client,
      row,
      input.milestone === "profile_ready" ? "profile_generated" : "questions_generated",
      input.idempotencyKey,
      {
        schemaVersion: SESSION_SCHEMA_VERSION,
        source: input.generationSource,
        provider: measurement.provider,
        model: measurement.model,
        latencyMs: measurement.latencyMs,
        attempts: measurement.attempts,
        inputTokens: measurement.inputTokens,
        outputTokens: measurement.outputTokens,
        requestId: measurement.requestId
      }
    );
    return (await loadSnapshot(client, input.userId, { sessionId: input.sessionId }))!;
  });
}

export async function saveInterviewAnswer(input: {
  userId: string;
  sessionId: string;
  questionId: string;
  answer: Omit<InterviewAnswer, "questionId">;
  idempotencyKey: string;
}) {
  if (!isUuid(input.sessionId) || !isUuid(input.idempotencyKey) || !input.questionId.trim()) {
    throw new InterviewPersistenceError("INPUT_INVALID", 400);
  }
  return withUserTransaction(input.userId, async (client) => {
    const row = await lockSession(client, input.userId, input.sessionId);
    if (statusRank[row.status as PersistedSessionStatus] < statusRank.questions_ready || row.status === "completed") {
      throw new InterviewPersistenceError("INVALID_STATE_TRANSITION", 409);
    }
    if (!validateQuestions(row.questions) || !row.questions.some((question) => question.id === input.questionId)) {
      throw new InterviewPersistenceError("INPUT_INVALID", 400);
    }
    await client.query(
      `insert into public.interview_answers(
         session_id, user_id, question_id, answer_text, input_mode, duration_sec, stt_status
       )
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (session_id, question_id) do update
         set answer_text = excluded.answer_text,
             input_mode = excluded.input_mode,
             duration_sec = excluded.duration_sec,
             stt_status = excluded.stt_status`,
      [
        input.sessionId,
        input.userId,
        input.questionId,
        input.answer.answerText,
        input.answer.inputMode,
        input.answer.durationSec,
        input.answer.sttStatus
      ]
    );
    if (row.status === "questions_ready") {
      await client.query(
        `update public.interview_sessions
            set status = 'in_progress', started_at = coalesce(started_at, now()), version = version + 1
          where id = $1 and user_id = $2`,
        [input.sessionId, input.userId]
      );
    }
    await insertSessionEvent(client, row, "answer_saved", input.idempotencyKey, {
      schemaVersion: SESSION_SCHEMA_VERSION,
      questionId: input.questionId
    });
    return (await loadSnapshot(client, input.userId, { sessionId: input.sessionId }))!;
  });
}

export async function saveInterviewReport(input: {
  userId: string;
  sessionId: string;
  expectedVersion: number;
  report: InterviewReport;
  generationSource: GenerationSource;
  measurement?: GenerationMeasurement;
  idempotencyKey: string;
}) {
  if (
    !isUuid(input.sessionId) ||
    !isUuid(input.idempotencyKey) ||
    !validateReport(input.report) ||
    !isGenerationSource(input.generationSource)
  ) {
    throw new InterviewPersistenceError("INPUT_INVALID", 400);
  }
  const measurement = normalizeMeasurement(
    input.measurement,
    input.generationSource
  );
  return withUserTransaction(input.userId, async (client) => {
    const row = await lockSession(client, input.userId, input.sessionId);
    assertVersion(row, input.expectedVersion, "report_ready");
    if (row.status === "report_ready") {
      return (await loadSnapshot(client, input.userId, { sessionId: input.sessionId }))!;
    }
    if (row.status !== "in_progress") {
      throw new InterviewPersistenceError("INVALID_STATE_TRANSITION", 409);
    }
    await client.query(
      `update public.interview_sessions
          set report = $1::jsonb, status = 'report_ready',
              generation_source = case when generation_source = $2 then $2 else 'mixed' end,
              version = version + 1
        where id = $3 and user_id = $4`,
      [JSON.stringify(input.report), input.generationSource, input.sessionId, input.userId]
    );
    await insertSessionEvent(client, row, "report_generated", input.idempotencyKey, {
      schemaVersion: SESSION_SCHEMA_VERSION,
      source: input.generationSource,
      provider: measurement.provider,
      model: measurement.model,
      latencyMs: measurement.latencyMs,
      attempts: measurement.attempts,
      inputTokens: measurement.inputTokens,
      outputTokens: measurement.outputTokens,
      requestId: measurement.requestId
    });
    return (await loadSnapshot(client, input.userId, { sessionId: input.sessionId }))!;
  });
}

export async function completeInterviewSession(input: {
  userId: string;
  sessionId: string;
  expectedVersion: number;
  idempotencyKey: string;
}) {
  if (!isUuid(input.sessionId) || !isUuid(input.idempotencyKey)) {
    throw new InterviewPersistenceError("INPUT_INVALID", 400);
  }
  return withUserTransaction(input.userId, async (client) => {
    const row = await lockSession(client, input.userId, input.sessionId);
    assertVersion(row, input.expectedVersion, "completed");
    if (row.status === "completed") {
      return (await loadSnapshot(client, input.userId, { sessionId: input.sessionId }))!;
    }
    if (row.status !== "report_ready" || !validateReport(row.report)) {
      throw new InterviewPersistenceError("INVALID_STATE_TRANSITION", 409);
    }
    await client.query(
      `update public.interview_sessions
          set status = 'completed', completed_at = now(), version = version + 1
        where id = $1 and user_id = $2`,
      [input.sessionId, input.userId]
    );
    const answerCount = await client.query(
      `select count(*)::int as count
         from public.interview_answers
        where session_id = $1 and user_id = $2`,
      [input.sessionId, input.userId]
    );
    await insertSessionEvent(client, row, "session_completed", input.idempotencyKey, {
      schemaVersion: SESSION_SCHEMA_VERSION,
      answeredCount: Number(answerCount.rows[0]?.count ?? 0),
      durationSec: row.started_at
        ? Math.max(
            0,
            Math.round((Date.now() - new Date(row.started_at as Date | string).getTime()) / 1000)
          )
        : 0
    });
    return (await loadSnapshot(client, input.userId, { sessionId: input.sessionId }))!;
  });
}
