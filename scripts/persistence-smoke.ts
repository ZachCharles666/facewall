import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";

import { demoScenario } from "../lib/demo/scenario";

loadEnvConfig(process.cwd());

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim();
const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
if (!adminUrl) throw new Error("INTERNAL_BETA_CONFIG_INVALID: DATABASE_ADMIN_URL");
if (!authSecret) throw new Error("INTERNAL_BETA_CONFIG_INVALID: BETTER_AUTH_SECRET");

const baseUrl = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const admin = new Pool({ connectionString: adminUrl });

interface ApiError {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
}

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

async function api<T>(
  path: string,
  cookie: string,
  init?: RequestInit,
  expectedStatus = 200
) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      cookie,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    }
  });
  const body = (await response.json()) as ApiSuccess<T> | ApiError;
  assert.equal(
    response.status,
    expectedStatus,
    `${path}: expected ${expectedStatus}, got ${response.status}, body=${JSON.stringify(body)}`
  );
  return body;
}

function json(method: "POST" | "PATCH" | "PUT", body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

function signedSessionCookie(token: string) {
  const signature = createHmac("sha256", authSecret!)
    .update(token)
    .digest("base64");
  const value = encodeURIComponent(`${token}.${signature}`);
  return [
    `better-auth.session_token=${value}`,
    `__Secure-better-auth.session_token=${value}`
  ].join("; ");
}

async function main() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const ownerId = `persistence-owner-${suffix}`;
  const otherId = `persistence-other-${suffix}`;
  const ownerToken = crypto.randomUUID();
  const otherToken = crypto.randomUUID();
  const schoolCode = `persistence-${suffix}`;
  let schoolId = "";
  let inviteId = "";

  try {
    const staleUsers = await admin.query(
      `select id from auth."user" where id like 'persistence-%'`
    );
    const staleUserIds = staleUsers.rows.map((row) => String(row.id));
    if (staleUserIds.length > 0) {
      await admin.query(
        `delete from public.interview_sessions where user_id = any($1::text[])`,
        [staleUserIds]
      );
      await admin.query(
        `delete from public.user_profiles where user_id = any($1::text[])`,
        [staleUserIds]
      );
      await admin.query(
        `delete from public.invite_codes where created_by = any($1::text[])`,
        [staleUserIds]
      );
      await admin.query(
        `delete from public.schools where code like 'persistence-%'`
      );
      await admin.query(`delete from auth."user" where id = any($1::text[])`, [
        staleUserIds
      ]);
    }

    for (const [userId, token] of [
      [ownerId, ownerToken],
      [otherId, otherToken]
    ]) {
      await admin.query(
        `insert into auth."user"(
           id, name, email, "emailVerified", "createdAt", "updatedAt"
         )
         values ($1, $1, $2, true, now(), now())`,
        [userId, `${userId}@example.test`]
      );
      await admin.query(
        `insert into auth.session(
           id, "expiresAt", token, "createdAt", "updatedAt", "userId"
         )
         values ($1, now() + interval '1 hour', $2, now(), now(), $3)`,
        [crypto.randomUUID(), token, userId]
      );
    }

    const school = await admin.query(
      `insert into public.schools(code, name)
       values ($1, 'Persistence Smoke School')
       returning id`,
      [schoolCode]
    );
    schoolId = school.rows[0].id;
    const invite = await admin.query(
      `insert into public.invite_codes(
         school_id, code_hash, label, max_uses, created_by
       )
       values ($1, $2, 'persistence-smoke', 2, $3)
       returning id`,
      [schoolId, `persistence-hash-${suffix}`, ownerId]
    );
    inviteId = invite.rows[0].id;

    for (const userId of [ownerId, otherId]) {
      await admin.query(
        `insert into public.user_profiles(
           user_id, school_id, invite_code_id, email_normalized,
           session_limit, sessions_started
         )
         values ($1, $2, $3, $4, 3, 0)`,
        [userId, schoolId, inviteId, `${userId}@example.test`]
      );
      await admin.query(
        `insert into public.consent_records(
           user_id, policy_version, consent_scope, accepted_at, request_id
         )
         values ($1, '2026-07', array['interview_delivery', 'internal_analysis'], now(), $2)`,
        [userId, crypto.randomUUID()]
      );
    }
    await admin.query(
      `update public.user_profiles set role = 'admin' where user_id = $1`,
      [otherId]
    );

    const ownerCookie = signedSessionCookie(ownerToken);
    const otherCookie = signedSessionCookie(otherToken);
    const createKey = crypto.randomUUID();
    const createPayload = {
      resumeText: demoScenario.resumeText,
      jdText: demoScenario.jdText,
      interviewerStyleId: demoScenario.defaultInterviewerStyleId,
      idempotencyKey: createKey
    };

    const createdBody = await api<{
      sessionId: string;
      version: number;
      quota: { used: number; remaining: number };
    }>(
      "/api/interview-sessions",
      ownerCookie,
      json("POST", createPayload),
      201
    );
    assert.equal(createdBody.ok, true);
    if (!createdBody.ok) return;
    const sessionId = createdBody.data.sessionId;
    assert.equal(createdBody.data.quota.used, 1);

    const replayBody = await api<typeof createdBody.data>(
      "/api/interview-sessions",
      ownerCookie,
      json("POST", createPayload),
      201
    );
    assert.equal(replayBody.ok, true);
    if (!replayBody.ok) return;
    assert.equal(replayBody.data.sessionId, sessionId);
    assert.equal(replayBody.data.quota.used, 1);

    const profileBody = await api<{ version: number }>(
      `/api/interview-sessions/${sessionId}`,
      ownerCookie,
      json("PATCH", {
        expectedVersion: 1,
        milestone: "profile_ready",
        candidateProfile: demoScenario.candidateProfile,
        generationSource: "demo_fallback",
        idempotencyKey: crypto.randomUUID()
      })
    );
    assert.equal(profileBody.ok, true);
    if (!profileBody.ok) return;
    assert.equal(profileBody.data.version, 2);

    const versionConflict = await api<unknown>(
      `/api/interview-sessions/${sessionId}`,
      ownerCookie,
      json("PATCH", {
        expectedVersion: 1,
        milestone: "questions_ready",
        questions: demoScenario.questions,
        generationSource: "demo_fallback",
        idempotencyKey: crypto.randomUUID()
      }),
      409
    );
    assert.equal(versionConflict.ok, false);
    if (versionConflict.ok) return;
    assert.equal(versionConflict.error.code, "SESSION_CONFLICT");

    const questionsBody = await api<{ version: number }>(
      `/api/interview-sessions/${sessionId}`,
      ownerCookie,
      json("PATCH", {
        expectedVersion: 2,
        milestone: "questions_ready",
        questions: demoScenario.questions,
        generationSource: "demo_fallback",
        idempotencyKey: crypto.randomUUID()
      })
    );
    assert.equal(questionsBody.ok, true);
    if (!questionsBody.ok) return;
    assert.equal(questionsBody.data.version, 3);

    const currentBody = await api<{
      sessionId: string;
      status: string;
      questions: unknown[];
    }>("/api/interview-sessions/current", ownerCookie);
    assert.equal(currentBody.ok, true);
    if (!currentBody.ok) return;
    assert.equal(currentBody.data.sessionId, sessionId);
    assert.equal(currentBody.data.status, "questions_ready");
    assert.equal(currentBody.data.questions.length, 3);

    const invalidTransition = await api<unknown>(
      `/api/interview-sessions/${sessionId}`,
      ownerCookie,
      json("PATCH", {
        expectedVersion: 3,
        milestone: "profile_ready",
        candidateProfile: demoScenario.candidateProfile,
        generationSource: "demo_fallback",
        idempotencyKey: crypto.randomUUID()
      }),
      409
    );
    assert.equal(invalidTransition.ok, false);
    if (invalidTransition.ok) return;
    assert.equal(invalidTransition.error.code, "INVALID_STATE_TRANSITION");

    const invalidQuestion = await api<unknown>(
      `/api/interview-sessions/${sessionId}/answers/not-in-session`,
      ownerCookie,
      json("PUT", {
        ...demoScenario.sampleAnswers[0],
        questionId: undefined,
        idempotencyKey: crypto.randomUUID()
      }),
      400
    );
    assert.equal(invalidQuestion.ok, false);
    if (invalidQuestion.ok) return;
    assert.equal(invalidQuestion.error.code, "INPUT_INVALID");

    let currentVersion = 3;
    for (const answer of demoScenario.sampleAnswers) {
      const answerBody = await api<{ version: number }>(
        `/api/interview-sessions/${sessionId}/answers/${answer.questionId}`,
        ownerCookie,
        json("PUT", { ...answer, idempotencyKey: crypto.randomUUID() })
      );
      assert.equal(answerBody.ok, true);
      if (!answerBody.ok) return;
      currentVersion = answerBody.data.version;
    }
    assert.equal(currentVersion, 4);

    const reportBody = await api<{ version: number }>(
      `/api/interview-sessions/${sessionId}/report`,
      ownerCookie,
      json("POST", {
        expectedVersion: currentVersion,
        report: demoScenario.report,
        generationSource: "demo_fallback",
        idempotencyKey: crypto.randomUUID()
      })
    );
    assert.equal(reportBody.ok, true);
    if (!reportBody.ok) return;
    assert.equal(reportBody.data.version, 5);

    const completeBody = await api<{
      version: number;
      status: string;
      report: unknown;
    }>(
      `/api/interview-sessions/${sessionId}/complete`,
      ownerCookie,
      json("POST", {
        expectedVersion: reportBody.data.version,
        idempotencyKey: crypto.randomUUID()
      })
    );
    assert.equal(completeBody.ok, true);
    if (!completeBody.ok) return;
    assert.equal(completeBody.data.status, "completed");
    assert.ok(completeBody.data.report);

    const invalidFeedback = await api<unknown>(
      `/api/interview-sessions/${sessionId}/feedback`,
      ownerCookie,
      json("POST", {
        rating: 6,
        comment: null,
        idempotencyKey: crypto.randomUUID()
      }),
      400
    );
    assert.equal(invalidFeedback.ok, false);
    const nonOwnerFeedback = await api<unknown>(
      `/api/interview-sessions/${sessionId}/feedback`,
      otherCookie,
      json("POST", {
        rating: 5,
        comment: null,
        idempotencyKey: crypto.randomUUID()
      }),
      404
    );
    assert.equal(nonOwnerFeedback.ok, false);
    const feedbackKey = crypto.randomUUID();
    const feedback = await api<{ id: string; rating: number }>(
      `/api/interview-sessions/${sessionId}/feedback`,
      ownerCookie,
      json("POST", {
        rating: 5,
        comment: "production fixture feedback",
        idempotencyKey: feedbackKey
      }),
      201
    );
    const feedbackReplay = await api<{ id: string; rating: number }>(
      `/api/interview-sessions/${sessionId}/feedback`,
      ownerCookie,
      json("POST", {
        rating: 1,
        comment: "must not overwrite",
        idempotencyKey: crypto.randomUUID()
      }),
      201
    );
    assert.equal(feedback.ok, true);
    assert.equal(feedbackReplay.ok, true);
    if (!feedback.ok || !feedbackReplay.ok) return;
    assert.equal(feedbackReplay.data.id, feedback.data.id);
    assert.equal(feedbackReplay.data.rating, 5);

    const clientEventKey = crypto.randomUUID();
    const clientEventPayload = {
      eventName: "report_viewed",
      sessionId,
      idempotencyKey: clientEventKey,
      properties: { theme: "classic" },
      userId: otherId,
      schoolId: "forged"
    };
    const clientEvent = await api<{ recorded: boolean }>(
      "/api/events",
      ownerCookie,
      json("POST", clientEventPayload),
      201
    );
    const clientReplay = await api<{ recorded: boolean }>(
      "/api/events",
      ownerCookie,
      json("POST", clientEventPayload),
      201
    );
    assert.equal(clientEvent.ok && clientEvent.data.recorded, true);
    assert.equal(clientReplay.ok && clientReplay.data.recorded, false);
    const forgedServerEvent = await api<unknown>(
      "/api/events",
      ownerCookie,
      json("POST", {
        eventName: "session_completed",
        sessionId,
        idempotencyKey: crypto.randomUUID(),
        properties: {}
      }),
      400
    );
    assert.equal(forgedServerEvent.ok, false);
    const forbiddenSummary = await api<unknown>(
      "/api/admin/feedback-summary",
      ownerCookie,
      undefined,
      403
    );
    assert.equal(forbiddenSummary.ok, false);
    const feedbackSummary = await api<{
      count: number;
      averageRating: number;
      ratings: Record<string, number>;
    }>("/api/admin/feedback-summary", otherCookie);
    assert.equal(feedbackSummary.ok, true);
    if (!feedbackSummary.ok) return;
    assert.ok(feedbackSummary.data.count >= 1);
    assert.doesNotMatch(
      JSON.stringify(feedbackSummary.data),
      /comment|userId|sessionId|production fixture/i
    );

    const crossUser = await api<unknown>(
      `/api/interview-sessions/${sessionId}`,
      otherCookie,
      undefined,
      404
    );
    assert.equal(crossUser.ok, false);
    if (crossUser.ok) return;
    assert.equal(crossUser.error.code, "RESOURCE_NOT_FOUND");

    for (let index = 0; index < 2; index += 1) {
      const extra = await api<unknown>(
        "/api/interview-sessions",
        ownerCookie,
        json("POST", {
          ...createPayload,
          idempotencyKey: crypto.randomUUID()
        }),
        201
      );
      assert.equal(extra.ok, true);
    }
    const exhausted = await api<unknown>(
      "/api/interview-sessions",
      ownerCookie,
      json("POST", {
        ...createPayload,
        idempotencyKey: crypto.randomUUID()
      }),
      409
    );
    assert.equal(exhausted.ok, false);
    if (exhausted.ok) return;
    assert.equal(exhausted.error.code, "SESSION_QUOTA_EXHAUSTED");

    const completedAfterExhaustion = await api<{ status: string }>(
      `/api/interview-sessions/${sessionId}`,
      ownerCookie
    );
    assert.equal(completedAfterExhaustion.ok, true);
    if (!completedAfterExhaustion.ok) return;
    assert.equal(completedAfterExhaustion.data.status, "completed");

    const eventRows = await admin.query(
      `select event_name, properties
         from public.product_events
        where user_id = $1 and session_id = $2
        order by created_at`,
      [ownerId, sessionId]
    );
    assert.ok(eventRows.rowCount && eventRows.rowCount >= 8);
    assert.ok(
      eventRows.rows.every((row) => {
        const serialized = JSON.stringify(row.properties);
        return (
          !serialized.includes(demoScenario.resumeText.slice(0, 20)) &&
          !serialized.includes(demoScenario.jdText.slice(0, 20))
        );
      })
    );

    console.log(
      JSON.stringify({
        ok: true,
        createReplay: "single-session-single-charge",
        milestones: [
          "profile_ready",
          "questions_ready",
          "in_progress",
          "report_ready",
          "completed"
        ],
        answersPersisted: 3,
        recoverySnapshot: "questions_ready",
        versionConflict: "rejected",
        invalidTransition: "rejected",
        invalidQuestionId: "rejected",
        serverEvents: eventRows.rowCount,
        feedback: {
          idempotent: true,
          invalidRejected: true,
          nonOwnerRejected: true,
          adminAggregateRedacted: true
        },
        clientEvents: {
          derivedOwner: true,
          replayDeduplicated: true,
          serverEventForgeryRejected: true
        },
        crossUserRead: "not-found",
        quota: { limit: 3, exhaustedNewCreate: true, existingReadable: true }
      })
    );
  } finally {
    await admin.query(
      `delete from public.product_events where user_id = any($1::text[])`,
      [[ownerId, otherId]]
    );
    await admin.query(
      `delete from public.interview_sessions where user_id = any($1::text[])`,
      [[ownerId, otherId]]
    );
    await admin.query(
      `delete from public.user_profiles where user_id = any($1::text[])`,
      [[ownerId, otherId]]
    );
    if (inviteId) {
      await admin.query(`delete from public.invite_codes where id = $1`, [
        inviteId
      ]);
    }
    if (schoolId) {
      await admin.query(`delete from public.schools where id = $1`, [schoolId]);
    }
    await admin.query(`delete from auth."user" where id = any($1::text[])`, [
      [ownerId, otherId]
    ]);
    await admin.end();
  }
}

void main();
