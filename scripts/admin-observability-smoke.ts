import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";

loadEnvConfig(process.cwd());

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim();
const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
if (!adminUrl) throw new Error("INTERNAL_BETA_CONFIG_INVALID: DATABASE_ADMIN_URL");
if (!authSecret) throw new Error("INTERNAL_BETA_CONFIG_INVALID: BETTER_AUTH_SECRET");

const baseUrl = (process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const pool = new Pool({ connectionString: adminUrl, application_name: "ib06-http-smoke" });

function signedSessionCookie(token: string) {
  const signature = createHmac("sha256", authSecret!).update(token).digest("base64");
  const value = encodeURIComponent(`${token}.${signature}`);
  return [
    `better-auth.session_token=${value}`,
    `__Secure-better-auth.session_token=${value}`
  ].join("; ");
}

async function api<T>(
  path: string,
  cookie: string,
  init: RequestInit = {},
  expectedStatus = 200
) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      cookie,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers
    }
  });
  const body = (await response.json()) as {
    ok: boolean;
    data: T | null;
    error: { code: string; message: string } | null;
    requestId: string;
  };
  assert.equal(response.status, expectedStatus, `${path}: ${JSON.stringify(body)}`);
  assert.equal(response.headers.get("x-request-id"), body.requestId);
  return body;
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const adminId = `ib06-http-admin-${suffix}`;
  const userId = `ib06-http-user-${suffix}`;
  const adminToken = randomUUID();
  const userToken = randomUUID();
  const seedSchoolCode = `ib06-http-seed-${suffix}`;
  const createdSchoolCode = `ib06-http-created-${suffix}`;
  const metricIds: string[] = [];
  let seedSchoolId = "";
  let seedInviteId = "";
  let createdSchoolId = "";
  let createdInviteId = "";

  try {
    for (const [id, token, role] of [
      [adminId, adminToken, "admin"],
      [userId, userToken, "user"]
    ] as const) {
      await pool.query(
        `insert into auth."user"(
           id, name, email, "emailVerified", "createdAt", "updatedAt"
         ) values ($1, '', $2, true, now(), now())`,
        [id, `${id}@example.test`]
      );
      await pool.query(
        `insert into auth.session(
           id, "expiresAt", token, "createdAt", "updatedAt", "userId"
         ) values ($1, now() + interval '1 hour', $2, now(), now(), $3)`,
        [randomUUID(), token, id]
      );
      if (role === "admin") {
        await pool.query(
          `insert into public.schools(code, name)
           values ($1, 'IB06 HTTP Seed') returning id`,
          [seedSchoolCode]
        ).then((result) => {
          seedSchoolId = result.rows[0].id;
        });
        await pool.query(
          `insert into public.invite_codes(
             school_id, code_hash, label, max_uses, created_by
           ) values ($1, $2, 'ib06-http-seed', 2, $3) returning id`,
          [seedSchoolId, `ib06-http-seed-hash-${suffix}`, adminId]
        ).then((result) => {
          seedInviteId = result.rows[0].id;
        });
      }
      await pool.query(
        `insert into public.user_profiles(
           user_id, school_id, invite_code_id, email_normalized, role,
           session_limit, sessions_started
         ) values ($1, $2, $3, $4, $5, 3, 0)`,
        [id, seedSchoolId, seedInviteId, `${id}@example.test`, role]
      );
    }

    const adminCookie = signedSessionCookie(adminToken);
    const userCookie = signedSessionCookie(userToken);

    const denied = await api<unknown>("/api/admin/metrics", userCookie, {}, 403);
    assert.equal(denied.error?.code, "FORBIDDEN");

    const userPage = await fetch(`${baseUrl}/admin`, {
      headers: { cookie: userCookie },
      redirect: "manual"
    });
    assert.equal(userPage.status, 404);

    const adminPage = await fetch(`${baseUrl}/admin`, {
      headers: { cookie: adminCookie }
    });
    assert.equal(adminPage.status, 200);
    const html = await adminPage.text();
    assert.match(html, /运营与可观测性/);
    for (const forbidden of ["fixture resume", "fixture jd", "answer_text", "copyText"]) {
      assert.equal(html.includes(forbidden), false);
    }

    const createdSchool = await api<{ id: string }>(
      "/api/admin/schools",
      adminCookie,
      {
        method: "POST",
        body: JSON.stringify({
          code: createdSchoolCode,
          name: "IB06 HTTP Created",
          emailDomains: ["created.example.test"]
        })
      },
      201
    );
    assert.equal(createdSchool.ok, true);
    createdSchoolId = createdSchool.data!.id;

    const createdInvite = await api<{ id: string; inviteCode: string }>(
      "/api/admin/invite-codes",
      adminCookie,
      {
        method: "POST",
        body: JSON.stringify({
          schoolId: createdSchoolId,
          label: "ib06-http",
          maxUses: 5,
          sessionLimitPerUser: 3
        })
      },
      201
    );
    createdInviteId = createdInvite.data!.id;
    const plaintextInvite = createdInvite.data!.inviteCode;
    assert.match(plaintextInvite, /^PB-/);

    const disabled = await api<{ id: string; status: string }>(
      "/api/admin/invite-codes",
      adminCookie,
      {
        method: "PATCH",
        body: JSON.stringify({ id: createdInviteId, status: "disabled" })
      }
    );
    assert.equal(disabled.data?.status, "disabled");

    const metrics = await api<Record<string, unknown>>(
      `/api/admin/metrics?from=${encodeURIComponent(
        new Date(Date.now() - 60 * 60 * 1000).toISOString()
      )}&to=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`,
      adminCookie
    );
    const metricsText = JSON.stringify(metrics);
    for (const forbidden of [
      "resumeText",
      "jdText",
      "answerText",
      "candidateProfile",
      plaintextInvite
    ]) {
      assert.equal(metricsText.includes(forbidden), false);
    }

    const persistedInvite = await pool.query(
      "select code_hash from public.invite_codes where id = $1",
      [createdInviteId]
    );
    assert.equal(persistedInvite.rows[0].code_hash.includes(plaintextInvite), false);
    const audits = await pool.query(
      `select action, request_id, metadata
         from public.admin_audit_logs
        where target_id = any($1::text[])
        order by occurred_at`,
      [[createdSchoolId, createdInviteId]]
    );
    assert.deepEqual(
      audits.rows.map((row) => row.action),
      ["school.create", "invite.create", "invite.disable"]
    );
    assert.equal(JSON.stringify(audits.rows).includes(plaintextInvite), false);

    for (let index = 0; index < 3; index += 1) {
      const requestId = `ib06-http-auth-fault-${randomUUID()}`;
      metricIds.push(requestId);
      await pool.query(
        `insert into public.api_request_metrics(
           request_id, route, method, status_code, duration_ms, error_code
         ) values ($1, '/api/auth/session', 'GET', 503, 100, 'AUTH_SERVICE_UNAVAILABLE')`,
        [requestId]
      );
    }
    const alertDrill = await api<{
      signals: Array<{ code: string; triggered: boolean }>;
      deliveries: Array<{ code: string; captured: boolean }>;
    }>(
      "/api/admin/alerts/evaluate",
      adminCookie,
      { method: "POST", body: JSON.stringify({ windowMinutes: 5 }) }
    );
    assert.equal(
      alertDrill.data?.signals.find((signal) => signal.code === "AUTH_UNAVAILABLE")
        ?.triggered,
      true
    );
    assert.equal(
      alertDrill.data?.deliveries.find((item) => item.code === "AUTH_UNAVAILABLE")
        ?.captured,
      false
    );

    const clientError = await api<{ accepted: boolean; captured: boolean }>(
      "/api/monitor/client-error",
      "",
      {
        method: "POST",
        body: JSON.stringify({
          name: "SmokeClientError",
          message: "token=smoke-secret otp=123456",
          source: "window-error",
          path: "/?token=smoke-secret"
        })
      }
    );
    assert.equal(clientError.data?.accepted, true);
    assert.equal(clientError.data?.captured, false);

    console.log(
      JSON.stringify({
        ok: true,
        userAdminApi: "forbidden",
        userAdminPage: "not-found",
        adminPage: "rendered",
        requestIdTrace: "response-header-body",
        audits: audits.rowCount,
        metricsPrivacy: "aggregate-only",
        alertRule: "triggered",
        realAlertDelivery: "not-configured"
      })
    );
  } finally {
    await pool.query(
      "delete from public.api_request_metrics where request_id = any($1::text[])",
      [metricIds]
    );
    await pool.query(
      "delete from public.admin_audit_logs where target_id = any($1::text[])",
      [[createdSchoolId || "", createdInviteId || ""]]
    );
    await pool.query("delete from public.invite_codes where id = $1", [
      createdInviteId || null
    ]);
    await pool.query("delete from public.schools where id = $1", [
      createdSchoolId || null
    ]);
    await pool.query(
      "delete from public.user_profiles where user_id = any($1::text[])",
      [[adminId, userId]]
    );
    await pool.query("delete from public.invite_codes where id = $1", [
      seedInviteId || null
    ]);
    await pool.query("delete from public.schools where id = $1", [
      seedSchoolId || null
    ]);
    await pool.query("delete from auth.session where \"userId\" = any($1::text[])", [
      [adminId, userId]
    ]);
    await pool.query("delete from auth.\"user\" where id = any($1::text[])", [
      [adminId, userId]
    ]);
    await pool.end();
  }
}

void main();
