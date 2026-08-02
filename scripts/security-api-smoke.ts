import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";

import { createAuthChallenge } from "../lib/auth/challenge";

loadEnvConfig(process.cwd());

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim();
const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
if (!adminUrl) throw new Error("INTERNAL_BETA_CONFIG_INVALID: DATABASE_ADMIN_URL");
if (!authSecret) throw new Error("INTERNAL_BETA_CONFIG_INVALID: BETTER_AUTH_SECRET");

const baseUrl = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const pool = new Pool({
  connectionString: adminUrl,
  application_name: "ib07-security-http-smoke"
});
const smokeRequestIds: string[] = [];

function signedSessionCookie(token: string) {
  const signature = createHmac("sha256", authSecret!).update(token).digest("base64");
  const value = encodeURIComponent(`${token}.${signature}`);
  return [
    `better-auth.session_token=${value}`,
    `__Secure-better-auth.session_token=${value}`
  ].join("; ");
}

async function api(
  path: string,
  init: RequestInit,
  expectedStatus: number
) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = (await response.json()) as {
    ok: boolean;
    data: unknown;
    error: { code: string; retryable: boolean } | null;
    requestId: string;
  };
  assert.equal(response.status, expectedStatus, `${path}: unexpected status`);
  assert.equal(response.headers.get("x-request-id"), body.requestId);
  smokeRequestIds.push(body.requestId);
  return { response, body };
}

function json(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  };
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const startedAt = new Date();
  const otpUser = `ib07-otp-${suffix}`;
  const userA = `ib07-http-a-${suffix}`;
  const userB = `ib07-http-b-${suffix}`;
  const userIds = [otpUser, userA, userB];
  const tokenA = randomUUID();
  const tokenB = randomUUID();
  const email = `${otpUser}@example.test`;
  const wrongOtpFixture = "111111";
  const storedOtpFixture = "222222";
  const forgedEventKey = randomUUID();
  let schoolA = "";
  let schoolB = "";

  try {
    for (const [id, token] of [
      [otpUser, null],
      [userA, tokenA],
      [userB, tokenB]
    ] as const) {
      await pool.query(
        `insert into auth."user"(
           id, name, email, "emailVerified", "createdAt", "updatedAt"
         ) values ($1, $1, $2, true, now(), now())`,
        [id, `${id}@example.test`]
      );
      if (token) {
        await pool.query(
          `insert into auth.session(
             id, "expiresAt", token, "createdAt", "updatedAt", "userId"
           ) values ($1, now() + interval '1 hour', $2, now(), now(), $3)`,
          [randomUUID(), token, id]
        );
      }
    }

    const schools = await pool.query(
      `insert into public.schools(code, name)
       values ($1, 'IB07 HTTP A'), ($2, 'IB07 HTTP B')
       returning id, code`,
      [`ib07-http-a-${suffix}`, `ib07-http-b-${suffix}`]
    );
    schoolA = String(
      schools.rows.find((row) => row.code === `ib07-http-a-${suffix}`)?.id
    );
    schoolB = String(
      schools.rows.find((row) => row.code === `ib07-http-b-${suffix}`)?.id
    );
    assert.ok(schoolA && schoolB);

    const invites = await Promise.all([
      pool.query(
        `insert into public.invite_codes(
           school_id, code_hash, label, max_uses, created_by
         ) values ($1, $2, 'ib07-http-a', 1, $3) returning id`,
        [schoolA, `ib07-http-a-${suffix}`, userA]
      ),
      pool.query(
        `insert into public.invite_codes(
           school_id, code_hash, label, max_uses, created_by
         ) values ($1, $2, 'ib07-http-b', 1, $3) returning id`,
        [schoolB, `ib07-http-b-${suffix}`, userB]
      )
    ]);
    await pool.query(
      `insert into public.user_profiles(
         user_id, school_id, invite_code_id, email_normalized, role
       ) values
         ($1, $3, $5, $7, 'user'),
         ($2, $4, $6, $8, 'user')`,
      [
        userA,
        userB,
        schoolA,
        schoolB,
        invites[0].rows[0].id,
        invites[1].rows[0].id,
        `${userA}@example.test`,
        `${userB}@example.test`
      ]
    );
    const sessionB = await pool.query(
      `insert into public.interview_sessions(
         user_id, school_id, resume_text, jd_text,
         interviewer_style_id, idempotency_key
       ) values ($1, $2, 'fixture resume B', 'fixture jd B', 'techBro', gen_random_uuid())
       returning id`,
      [userB, schoolB]
    );

    const storedOtpHash = createHash("sha256")
      .update(storedOtpFixture)
      .digest("base64url");
    await pool.query(
      `insert into auth.verification(
         id, identifier, value, "expiresAt", "createdAt", "updatedAt"
       ) values ($1, $2, $3, now() + interval '30 minutes', now(), now())`,
      [randomUUID(), `sign-in-otp-${email}`, `${storedOtpHash}:0`]
    );
    const challengeId = createAuthChallenge(email, authSecret!);
    const sessionsBefore = await pool.query(
      `select count(*)::int as count from auth.session where "userId" = $1`,
      [otpUser]
    );
    assert.equal(sessionsBefore.rows[0].count, 0);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await api(
        "/api/auth/verify-otp",
        json(
          { email, token: wrongOtpFixture, challengeId },
          { "x-forwarded-for": `198.51.100.${attempt}` }
        ),
        400
      );
      assert.equal(result.body.error?.code, "OTP_INVALID_OR_EXPIRED");
    }
    const attempts = await pool.query(
      `select value from auth.verification where identifier = $1`,
      [`sign-in-otp-${email}`]
    );
    assert.match(String(attempts.rows[0].value), /:3$/);
    const exhausted = await api(
      "/api/auth/verify-otp",
      json(
        { email, token: storedOtpFixture, challengeId },
        { "x-forwarded-for": "198.51.100.4" }
      ),
      400
    );
    assert.equal(exhausted.body.error?.code, "OTP_INVALID_OR_EXPIRED");
    const authAfter = await pool.query(
      `select
         (select count(*) from auth.session where "userId" = $1)::int as sessions,
         (select count(*) from auth.verification where identifier = $2)::int as verifications`,
      [otpUser, `sign-in-otp-${email}`]
    );
    assert.equal(authAfter.rows[0].sessions, 0);
    assert.equal(authAfter.rows[0].verifications, 0);

    const invalidContentType = await api(
      "/api/auth/verify-otp",
      {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          "x-forwarded-for": "203.0.113.1"
        },
        body: "{}"
      },
      400
    );
    assert.equal(invalidContentType.body.error?.code, "INPUT_INVALID");

    const oversized = await api(
      "/api/auth/verify-otp",
      json(
        {
          email,
          token: wrongOtpFixture,
          challengeId,
          padding: "x".repeat(5000)
        },
        { "x-forwarded-for": "203.0.113.2" }
      ),
      400
    );
    assert.equal(oversized.body.error?.code, "INPUT_INVALID");

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const invalid = await api(
        "/api/auth/verify-otp",
        json(
          { email, token: wrongOtpFixture, challengeId: "invalid" },
          { "x-forwarded-for": "203.0.113.9" }
        ),
        400
      );
      assert.equal(invalid.body.error?.code, "OTP_INVALID_OR_EXPIRED");
    }
    const limited = await api(
      "/api/auth/verify-otp",
      json(
        { email, token: wrongOtpFixture, challengeId: "invalid" },
        { "x-forwarded-for": "203.0.113.9" }
      ),
      429
    );
    assert.equal(limited.body.error?.code, "RATE_LIMITED");
    assert.ok(Number(limited.response.headers.get("retry-after")) >= 1);

    const cookieA = signedSessionCookie(tokenA);
    const ordinaryAdmin = await api(
      "/api/admin/metrics",
      { headers: { cookie: cookieA } },
      403
    );
    assert.equal(ordinaryAdmin.body.error?.code, "FORBIDDEN");

    const crossUser = await api(
      `/api/interview-sessions/${sessionB.rows[0].id}`,
      { headers: { cookie: cookieA } },
      404
    );
    assert.equal(crossUser.body.error?.code, "RESOURCE_NOT_FOUND");

    const forgedOwner = await api(
      "/api/events",
      json(
        {
          eventName: "page_viewed",
          idempotencyKey: forgedEventKey,
          userId: userB,
          schoolId: schoolB,
          properties: { step: "security", theme: "classic" }
        },
        { cookie: cookieA, "x-forwarded-for": "192.0.2.50" }
      ),
      201
    );
    assert.equal(forgedOwner.body.ok, true);
    const eventOwner = await pool.query(
      `select user_id, school_id
         from public.product_events
        where idempotency_key = $1`,
      [forgedEventKey]
    );
    assert.equal(eventOwner.rows[0].user_id, userA);
    assert.equal(String(eventOwner.rows[0].school_id), schoolA);

    console.log(JSON.stringify({
      ok: true,
      otp: {
        wrongAttempts: 3,
        exhaustedCorrectCodeAccepted: false,
        sessionsCreated: 0,
        rawOtpOutput: false
      },
      writeSecurity: {
        invalidContentType: "blocked",
        oversizedBody: "blocked",
        rateLimitedAfter: 10,
        retryAfterPresent: true
      },
      authorization: {
        ordinaryAdminStatus: 403,
        crossUserStatus: 404,
        forgedOwnerDerivedFromSession: true
      }
    }));
  } finally {
    if (smokeRequestIds.length > 0) {
      await pool.query(
        `delete from public.api_request_metrics where request_id = any($1::text[])`,
        [smokeRequestIds]
      ).catch(() => undefined);
    }
    await pool.query(
      `delete from auth.write_rate_limit_counters where updated_at >= $1`,
      [startedAt]
    ).catch(() => undefined);
    await pool.query(
      `delete from public.product_events where user_id = any($1::text[])`,
      [userIds]
    ).catch(() => undefined);
    await pool.query(
      `delete from public.interview_sessions where user_id = any($1::text[])`,
      [userIds]
    ).catch(() => undefined);
    await pool.query(
      `delete from public.user_profiles where user_id = any($1::text[])`,
      [userIds]
    ).catch(() => undefined);
    await pool.query(
      `delete from public.invite_codes where created_by = any($1::text[])`,
      [userIds]
    ).catch(() => undefined);
    if (schoolA || schoolB) {
      await pool.query(
        `delete from public.schools where id = any($1::uuid[])`,
        [[schoolA, schoolB].filter(Boolean)]
      ).catch(() => undefined);
    }
    await pool.query(
      `delete from auth.verification where identifier = $1`,
      [`sign-in-otp-${email}`]
    ).catch(() => undefined);
    await pool.query(
      `delete from auth."user" where id = any($1::text[])`,
      [userIds]
    ).catch(() => undefined);
    await pool.end();
  }
}

void main();
