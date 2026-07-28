import assert from "node:assert/strict";

import { loadEnvConfig } from "@next/env";

import { validateClientEvent, recordClientEvent } from "../../lib/analytics/events";
import { getAdminPool, getRuntimePool } from "../../lib/db/pool";
import { demoScenario } from "../../lib/demo/scenario";
import {
  submitSessionFeedback,
  FeedbackError
} from "../../lib/feedback/feedback";
import {
  completeInterviewSession,
  createInterviewSession,
  saveInterviewAnswer,
  saveInterviewReport,
  saveSessionMilestone
} from "../../lib/persistence/interviewSessions";

loadEnvConfig(process.cwd());
process.env.INTERNAL_BETA_AUTH_ENABLED = "true";
process.env.INTERNAL_BETA_REQUIRE_CONSENT = "true";

const admin = getAdminPool();
const runtime = getRuntimePool();

async function main() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const adminId = `ib05-admin-${suffix}`;
  const ownerId = `ib05-owner-${suffix}`;
  const otherId = `ib05-other-${suffix}`;
  let schoolId = "";
  let inviteId = "";
  try {
    for (const id of [adminId, ownerId, otherId]) {
      await admin.query(
        `insert into auth."user"(
           id, name, email, "emailVerified", "createdAt", "updatedAt"
         ) values ($1, $1, $2, true, now(), now())`,
        [id, `${id}@example.test`]
      );
    }
    const school = await admin.query(
      `insert into public.schools(code, name)
       values ($1, 'IB-05 fixture') returning id`,
      [`ib05-${suffix}`]
    );
    schoolId = String(school.rows[0].id);
    const invite = await admin.query(
      `insert into public.invite_codes(
         school_id, code_hash, label, max_uses, created_by
       ) values ($1, $2, 'IB-05 fixture', 3, $3) returning id`,
      [schoolId, `ib05-hash-${suffix}`, adminId]
    );
    inviteId = String(invite.rows[0].id);
    for (const [id, role] of [
      [adminId, "admin"],
      [ownerId, "user"],
      [otherId, "user"]
    ]) {
      await admin.query(
        `insert into public.user_profiles(
           user_id, school_id, invite_code_id, email_normalized, role
         ) values ($1, $2, $3, $4, $5)`,
        [id, schoolId, inviteId, `${id}@example.test`, role]
      );
      await admin.query(
        `insert into public.consent_records(
           user_id, policy_version, consent_scope, accepted_at, request_id
         ) values ($1, '2026-07', array['interview_delivery','internal_analysis'], now(), $2)`,
        [id, crypto.randomUUID()]
      );
    }

    const session = await createInterviewSession({
      userId: ownerId,
      resumeText: demoScenario.resumeText,
      jdText: demoScenario.jdText,
      interviewerStyleId: demoScenario.defaultInterviewerStyleId,
      idempotencyKey: crypto.randomUUID()
    });
    let snapshot = await saveSessionMilestone({
      userId: ownerId,
      sessionId: session.sessionId,
      expectedVersion: 1,
      milestone: "profile_ready",
      candidateProfile: demoScenario.candidateProfile,
      generationSource: "llm",
      measurement: {
        source: "llm",
        provider: "fixture-provider.example",
        model: "fixture-model",
        latencyMs: 321,
        attempts: 1,
        inputTokens: 120,
        outputTokens: 80,
        requestId: "req-fixture-usage-001"
      },
      idempotencyKey: crypto.randomUUID()
    });
    snapshot = await saveSessionMilestone({
      userId: ownerId,
      sessionId: session.sessionId,
      expectedVersion: snapshot.version,
      milestone: "questions_ready",
      questions: demoScenario.questions,
      generationSource: "demo_fallback",
      measurement: {
        source: "demo_fallback",
        provider: "local_demo",
        model: null,
        latencyMs: null,
        attempts: null,
        inputTokens: null,
        outputTokens: null,
        requestId: "req-fixture-fallback-001"
      },
      idempotencyKey: crypto.randomUUID()
    });
    for (const answer of demoScenario.sampleAnswers) {
      snapshot = await saveInterviewAnswer({
        userId: ownerId,
        sessionId: session.sessionId,
        questionId: answer.questionId,
        answer: {
          answerText: answer.answerText,
          inputMode: answer.inputMode,
          durationSec: answer.durationSec,
          sttStatus: answer.sttStatus
        },
        idempotencyKey: crypto.randomUUID()
      });
    }
    snapshot = await saveInterviewReport({
      userId: ownerId,
      sessionId: session.sessionId,
      expectedVersion: snapshot.version,
      report: demoScenario.report,
      generationSource: "demo_fallback",
      measurement: {
        source: "demo_fallback",
        provider: "local_demo",
        model: null,
        latencyMs: null,
        attempts: null,
        inputTokens: null,
        outputTokens: null,
        requestId: "req-fixture-fallback-002"
      },
      idempotencyKey: crypto.randomUUID()
    });
    snapshot = await completeInterviewSession({
      userId: ownerId,
      sessionId: session.sessionId,
      expectedVersion: snapshot.version,
      idempotencyKey: crypto.randomUUID()
    });
    assert.equal(snapshot.status, "completed");

    const generationEvents = await admin.query(
      `select event_name, properties
         from public.product_events
        where session_id = $1
          and event_name in ('profile_generated', 'questions_generated', 'report_generated')
        order by occurred_at`,
      [session.sessionId]
    );
    assert.deepEqual(generationEvents.rows[0].properties, {
      schemaVersion: 1,
      source: "llm",
      provider: "fixture-provider.example",
      model: "fixture-model",
      latencyMs: 321,
      attempts: 1,
      inputTokens: 120,
      outputTokens: 80,
      requestId: "req-fixture-usage-001"
    });
    for (const row of generationEvents.rows.slice(1)) {
      assert.equal(row.properties.source, "demo_fallback");
      assert.equal(row.properties.provider, "local_demo");
      assert.equal(row.properties.model, null);
      assert.equal(row.properties.latencyMs, null);
      assert.equal(row.properties.inputTokens, null);
      assert.equal(row.properties.outputTokens, null);
    }

    const draft = await createInterviewSession({
      userId: otherId,
      resumeText: demoScenario.resumeText,
      jdText: demoScenario.jdText,
      interviewerStyleId: "techBro",
      idempotencyKey: crypto.randomUUID()
    });
    await assert.rejects(
      submitSessionFeedback({
        userId: otherId,
        schoolId,
        sessionId: draft.sessionId,
        rating: 5,
        comment: null,
        idempotencyKey: crypto.randomUUID()
      }),
      (error) =>
        error instanceof FeedbackError &&
        error.code === "INVALID_STATE_TRANSITION"
    );
    await assert.rejects(
      submitSessionFeedback({
        userId: otherId,
        schoolId,
        sessionId: session.sessionId,
        rating: 5,
        comment: null,
        idempotencyKey: crypto.randomUUID()
      }),
      (error) =>
        error instanceof FeedbackError && error.code === "RESOURCE_NOT_FOUND"
    );
    for (const [rating, comment] of [
      [0, null],
      [6, null],
      [5, "x".repeat(501)]
    ] as const) {
      await assert.rejects(
        submitSessionFeedback({
          userId: ownerId,
          schoolId,
          sessionId: session.sessionId,
          rating,
          comment,
          idempotencyKey: crypto.randomUUID()
        }),
        (error) =>
          error instanceof FeedbackError && error.code === "INPUT_INVALID"
      );
    }

    const feedbackKey = crypto.randomUUID();
    const feedback = await submitSessionFeedback({
      userId: ownerId,
      schoolId,
      sessionId: session.sessionId,
      rating: 5,
      comment: "fixture feedback",
      idempotencyKey: feedbackKey
    });
    const replay = await submitSessionFeedback({
      userId: ownerId,
      schoolId,
      sessionId: session.sessionId,
      rating: 1,
      comment: "must not overwrite",
      idempotencyKey: crypto.randomUUID()
    });
    assert.equal(replay.id, feedback.id);
    assert.equal(replay.rating, 5);

    const eventKey = crypto.randomUUID();
    const clientPayload = validateClientEvent({
      eventName: "report_viewed",
      sessionId: session.sessionId,
      idempotencyKey: eventKey,
      properties: { theme: "classic" },
      userId: otherId,
      schoolId: "forged"
    });
    assert.ok(clientPayload);
    assert.equal(
      (
        await recordClientEvent(ownerId, schoolId, clientPayload)
      ).recorded,
      true
    );
    assert.equal(
      (
        await recordClientEvent(ownerId, schoolId, clientPayload)
      ).recorded,
      false
    );
    assert.equal(
      validateClientEvent({
        eventName: "session_completed",
        idempotencyKey: crypto.randomUUID(),
        properties: {}
      }),
      null
    );
    assert.equal(
      validateClientEvent({
        eventName: "report_viewed",
        idempotencyKey: crypto.randomUUID(),
        properties: { theme: "classic", answerText: "forbidden" }
      }),
      null
    );

    const reconciliation = await admin.query(
      `select
         (select count(*) from public.interview_sessions
           where school_id = $1 and status = 'completed')::int as completed_sessions,
         (select count(*) from public.product_events
           where school_id = $1 and event_name = 'session_completed')::int as completed_events,
         (select count(*) from public.feedback
           where school_id = $1)::int as feedback_rows,
         (select count(*) from public.product_events
           where school_id = $1 and event_name = 'feedback_submitted')::int as feedback_events,
         (select count(*) from public.product_events
           where school_id = $1 and event_name = 'report_viewed')::int as report_views`,
      [schoolId]
    );
    assert.deepEqual(reconciliation.rows[0], {
      completed_sessions: 1,
      completed_events: 1,
      feedback_rows: 1,
      feedback_events: 1,
      report_views: 1
    });
    const forbiddenBody = await admin.query(
      `select count(*)::int as count
         from public.product_events
        where school_id = $1
          and properties::text ~* '(resume|jd_text|answer_text|report)'`,
      [schoolId]
    );
    assert.equal(forbiddenBody.rows[0].count, 0);

    console.log(
      JSON.stringify({
        ok: true,
        fixtureOnly: true,
        feedback: {
          ownerAndStateEnforced: true,
          inputBoundsEnforced: true,
          idempotentRows: 1
        },
        events: {
          clientOwnerIgnored: true,
          serverEventRejected: true,
          unknownPropertyRejected: true,
          replayDeduplicated: true,
          sensitiveBodyMatches: 0
        },
        reconciliation: reconciliation.rows[0]
      })
    );
  } finally {
    await admin.query(`delete from auth."user" where id = any($1::text[])`, [
      [ownerId, otherId]
    ]);
    await admin.query(`delete from public.user_profiles where user_id = $1`, [adminId]);
    if (inviteId) await admin.query(`delete from public.invite_codes where id = $1`, [inviteId]);
    if (schoolId) await admin.query(`delete from public.schools where id = $1`, [schoolId]);
    await admin.query(`delete from auth."user" where id = $1`, [adminId]);
    await Promise.all([runtime.end(), admin.end()]);
  }
}

void main();
