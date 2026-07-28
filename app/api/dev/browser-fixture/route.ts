import { createHmac, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { readAuthConfig } from "@/lib/config/internalBeta";
import { getAdminPool } from "@/lib/db/pool";
import { demoScenario } from "@/lib/demo/scenario";
import { observeRoute } from "@/lib/observability/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedScenarios = new Set(["consent", "draft", "recovery", "report", "admin"]);
const allowedThemes = new Set(["figma", "juju", "classic"]);

function fixtureEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.INTERNAL_BETA_BROWSER_FIXTURES?.trim().toLowerCase() === "true"
  );
}

function signedSessionValue(token: string) {
  const signature = createHmac("sha256", readAuthConfig().secret)
    .update(token)
    .digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

async function seedFixture(scenario: string) {
  const pool = getAdminPool();
  const suffix = randomUUID().slice(0, 8);
  const userId = `browser-fixture-${scenario}-${suffix}`;
  const email = `${userId}@example.test`;
  const token = randomUUID();
  const schoolCode = `browser-fixture-${suffix}`;
  const client = await pool.connect();
  let sessionId: string | null = null;

  try {
    await client.query("begin");
    await client.query(
      `insert into auth."user"(
         id, name, email, "emailVerified", "createdAt", "updatedAt"
       ) values ($1, 'Browser Fixture', $2, true, now(), now())`,
      [userId, email]
    );
    await client.query(
      `insert into auth.session(
         id, "expiresAt", token, "createdAt", "updatedAt", "userId"
       ) values ($1, now() + interval '2 hours', $2, now(), now(), $3)`,
      [randomUUID(), token, userId]
    );
    const school = await client.query(
      `insert into public.schools(code, name)
       values ($1, 'Browser Fixture School')
       returning id`,
      [schoolCode]
    );
    const schoolId = String(school.rows[0].id);
    const invite = await client.query(
      `insert into public.invite_codes(
         school_id, code_hash, label, max_uses, created_by
       ) values ($1, $2, 'browser-fixture', 20, $3)
       returning id`,
      [schoolId, `browser-fixture-hash-${suffix}`, userId]
    );
    const inviteId = String(invite.rows[0].id);
    await client.query(
      `insert into public.user_profiles(
         user_id, school_id, invite_code_id, email_normalized, role,
         session_limit, sessions_started
       ) values ($1, $2, $3, $4, $5, 3, $6)`,
      [
        userId,
        schoolId,
        inviteId,
        email,
        scenario === "admin" ? "admin" : "user",
        ["draft", "recovery", "report"].includes(scenario) ? 1 : 0
      ]
    );
    if (scenario !== "consent") {
      await client.query(
        `insert into public.consent_records(
           user_id, policy_version, consent_scope, accepted_at, request_id
         ) values ($1, '2026-07', array['interview_delivery', 'internal_analysis'], now(), $2)`,
        [userId, randomUUID()]
      );
    }

    if (["draft", "recovery", "report"].includes(scenario)) {
      sessionId = randomUUID();
      const status =
        scenario === "draft"
          ? "draft"
          : scenario === "recovery"
            ? "questions_ready"
            : "report_ready";
      const version = scenario === "draft" ? 1 : scenario === "recovery" ? 3 : 5;
      await client.query(
        `insert into public.interview_sessions(
           id, user_id, school_id, status, version, schema_version,
           idempotency_key, resume_text, jd_text, interviewer_style_id,
           candidate_profile, questions, report, generation_source, started_at
         ) values (
           $1, $2, $3, $4, $5, 1, $6, $7, $8, $9,
           $10::jsonb, $11::jsonb, $12::jsonb, 'demo_fallback',
           case when $4 = 'report_ready' then now() - interval '5 minutes' else null end
         )`,
        [
          sessionId,
          userId,
          schoolId,
          status,
          version,
          randomUUID(),
          demoScenario.resumeText,
          demoScenario.jdText,
          demoScenario.defaultInterviewerStyleId,
          scenario === "draft" ? null : JSON.stringify(demoScenario.candidateProfile),
          scenario === "draft" ? null : JSON.stringify(demoScenario.questions),
          scenario === "report" ? JSON.stringify(demoScenario.report) : null
        ]
      );
      await client.query(
        `insert into public.product_events(
           user_id, school_id, session_id, event_name, source,
           idempotency_key, properties, occurred_at
         ) values ($1, $2, $3, 'session_started', 'server', $4, $5::jsonb, now())`,
        [
          userId,
          schoolId,
          sessionId,
          randomUUID(),
          JSON.stringify({ schemaVersion: 1, fixture: true })
        ]
      );
      if (scenario !== "draft") {
        for (const [eventName, source] of [
          ["profile_generated", "demo_fallback"],
          ["questions_generated", "demo_fallback"]
        ] as const) {
          await client.query(
            `insert into public.product_events(
               user_id, school_id, session_id, event_name, source,
               idempotency_key, properties, occurred_at
             ) values ($1, $2, $3, $4, 'server', $5, $6::jsonb, now())`,
            [
              userId,
              schoolId,
              sessionId,
              eventName,
              randomUUID(),
              JSON.stringify({
                schemaVersion: 1,
                source,
                provider: "local_demo",
                model: null,
                latencyMs: null,
                inputTokens: null,
                outputTokens: null,
                requestId: null
              })
            ]
          );
        }
      }
      if (scenario === "report") {
        for (const answer of demoScenario.sampleAnswers) {
          await client.query(
            `insert into public.interview_answers(
               session_id, user_id, question_id, answer_text, input_mode,
               duration_sec, stt_status
             ) values ($1, $2, $3, $4, $5, $6, $7)`,
            [
              sessionId,
              userId,
              answer.questionId,
              answer.answerText,
              answer.inputMode,
              answer.durationSec,
              answer.sttStatus
            ]
          );
        }
        await client.query(
          `insert into public.product_events(
             user_id, school_id, session_id, event_name, source,
             idempotency_key, properties, occurred_at
           ) values ($1, $2, $3, 'report_generated', 'server', $4, $5::jsonb, now())`,
          [
            userId,
            schoolId,
            sessionId,
            randomUUID(),
            JSON.stringify({
              schemaVersion: 1,
              source: "demo_fallback",
              provider: "local_demo",
              model: null,
              latencyMs: null,
              inputTokens: null,
              outputTokens: null,
              requestId: null
            })
          ]
        );
      }
    }

    await client.query("commit");
    return { token, userId, sessionId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function handleGet(request: Request) {
  if (!fixtureEnabled()) {
    return new NextResponse(null, { status: 404 });
  }
  const url = new URL(request.url);
  const scenario = allowedScenarios.has(url.searchParams.get("scenario") ?? "")
    ? String(url.searchParams.get("scenario"))
    : "report";
  const theme = allowedThemes.has(url.searchParams.get("theme") ?? "")
    ? String(url.searchParams.get("theme"))
    : "figma";
  const fixture = await seedFixture(scenario);
  const redirectPath = scenario === "admin" ? "/admin" : `/?theme=${theme}`;
  const response = NextResponse.redirect(new URL(redirectPath, url.origin));
  response.headers.set("cache-control", "no-store");
  response.headers.append(
    "set-cookie",
    `better-auth.session_token=${signedSessionValue(fixture.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200`
  );
  return response;
}

export async function GET(request: Request) {
  return observeRoute(
    request,
    { route: "/api/dev/browser-fixture" },
    () => handleGet(request)
  );
}
