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

async function api(
  path: string,
  cookie: string,
  init: RequestInit | undefined,
  expectedStatus: number
) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      cookie,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    }
  });
  const body = (await response.json()) as {
    ok: boolean;
    data?: Record<string, unknown>;
    error?: { code?: string };
  };
  assert.equal(
    response.status,
    expectedStatus,
    `${path}: ${response.status} ${JSON.stringify(body)}`
  );
  return body;
}

function post(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

function signedSessionCookie(token: string) {
  const signature = createHmac("sha256", authSecret!).update(token).digest("base64");
  const value = encodeURIComponent(`${token}.${signature}`);
  return [
    `better-auth.session_token=${value}`,
    `__Secure-better-auth.session_token=${value}`
  ].join("; ");
}

async function main() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const adminId = `privacy-api-admin-${suffix}`;
  const userId = `privacy-api-user-${suffix}`;
  const adminToken = crypto.randomUUID();
  const userToken = crypto.randomUUID();
  let schoolId = "";
  let inviteId = "";
  let deletionRequestId = "";

  try {
    for (const [id, token] of [
      [adminId, adminToken],
      [userId, userToken]
    ]) {
      await admin.query(
        `insert into auth."user"(
           id, name, email, "emailVerified", "createdAt", "updatedAt"
         ) values ($1, $1, $2, true, now(), now())`,
        [id, `${id}@example.test`]
      );
      await admin.query(
        `insert into auth.session(
           id, "expiresAt", token, "createdAt", "updatedAt", "userId"
         ) values ($1, now() + interval '1 hour', $2, now(), now(), $3)`,
        [crypto.randomUUID(), token, id]
      );
    }
    const school = await admin.query(
      `insert into public.schools(code, name)
       values ($1, 'Privacy API fixture') returning id`,
      [`privacy-api-${suffix}`]
    );
    schoolId = String(school.rows[0].id);
    const invite = await admin.query(
      `insert into public.invite_codes(
         school_id, code_hash, label, max_uses, created_by
       ) values ($1, $2, 'Privacy API fixture', 2, $3)
       returning id`,
      [schoolId, `privacy-api-hash-${suffix}`, adminId]
    );
    inviteId = String(invite.rows[0].id);
    for (const [id, role] of [
      [adminId, "admin"],
      [userId, "user"]
    ]) {
      await admin.query(
        `insert into public.user_profiles(
           user_id, school_id, invite_code_id, email_normalized, role
         ) values ($1, $2, $3, $4, $5)`,
        [id, schoolId, inviteId, `${id}@example.test`, role]
      );
    }

    const userCookie = signedSessionCookie(userToken);
    const adminCookie = signedSessionCookie(adminToken);
    const currentBefore = await api("/api/consent/current", userCookie, undefined, 200);
    assert.equal(currentBefore.data?.accepted, false);
    const blockedCreate = await api(
      "/api/interview-sessions",
      userCookie,
      post({
        resumeText: demoScenario.resumeText,
        jdText: demoScenario.jdText,
        interviewerStyleId: demoScenario.defaultInterviewerStyleId,
        idempotencyKey: crypto.randomUUID()
      }),
      403
    );
    assert.equal(blockedCreate.error?.code, "CONSENT_REQUIRED");
    const outdated = await api(
      "/api/consent/accept",
      userCookie,
      post({
        policyVersion: "2026-06",
        scopes: ["interview_delivery", "internal_analysis"],
        idempotencyKey: crypto.randomUUID()
      }),
      409
    );
    assert.equal(outdated.error?.code, "POLICY_VERSION_OUTDATED");
    const accepted = await api(
      "/api/consent/accept",
      userCookie,
      post({
        policyVersion: "2026-07",
        scopes: ["interview_delivery", "internal_analysis"],
        idempotencyKey: crypto.randomUUID()
      }),
      200
    );
    const repeated = await api(
      "/api/consent/accept",
      userCookie,
      post({
        policyVersion: "2026-07",
        scopes: ["interview_delivery", "internal_analysis"],
        idempotencyKey: crypto.randomUUID()
      }),
      200
    );
    assert.equal(repeated.data?.id, accepted.data?.id);
    const sanitizedFailure = await api(
      "/api/consent/accept",
      userCookie,
      {
        method: "POST",
        body: "{",
        headers: { "content-type": "application/json" }
      },
      500
    );
    assert.equal(sanitizedFailure.error?.code, "PRIVACY_OPERATION_FAILED");
    assert.ok(!JSON.stringify(sanitizedFailure).includes("SyntaxError"));

    const deletion = await api(
      "/api/privacy/deletion-requests",
      userCookie,
      post({ idempotencyKey: crypto.randomUUID() }),
      201
    );
    deletionRequestId = String(deletion.data?.id);
    const duplicate = await api(
      "/api/privacy/deletion-requests",
      userCookie,
      post({ idempotencyKey: crypto.randomUUID() }),
      201
    );
    assert.equal(duplicate.data?.id, deletionRequestId);
    const forbidden = await api(
      `/api/admin/deletion-requests/${deletionRequestId}/execute`,
      userCookie,
      post({}),
      403
    );
    assert.equal(forbidden.error?.code, "FORBIDDEN");
    await api(
      `/api/admin/deletion-requests/${deletionRequestId}/approve`,
      adminCookie,
      post({}),
      200
    );
    const privacyOnly = await api("/api/auth/session", userCookie, undefined, 200);
    assert.equal(privacyOnly.data?.privacyOnly, true);
    const visibleStatus = await api(
      "/api/privacy/deletion-requests",
      userCookie,
      undefined,
      200
    );
    assert.equal((visibleStatus.data as Record<string, unknown>)?.status, "approved");
    const completed = await api(
      `/api/admin/deletion-requests/${deletionRequestId}/execute`,
      adminCookie,
      post({}),
      200
    );
    assert.equal(completed.data?.status, "completed");
    await api("/api/auth/session", userCookie, undefined, 401);

    const audit = await admin.query(
      `select user_id, reason, audit_summary
         from public.deletion_requests
        where id = $1`,
      [deletionRequestId]
    );
    assert.equal(audit.rows[0].user_id, null);
    assert.equal(audit.rows[0].reason, null);
    assert.ok(!JSON.stringify(audit.rows[0].audit_summary).includes(userId));

    console.log(
      JSON.stringify({
        ok: true,
        fixtureOnly: true,
        consentApi: {
          current: true,
          outdatedRejected: true,
          idempotent: true,
          sessionGate: true,
          sanitizedProductionError: true
        },
        deletionApi: {
          userCreateAndView: true,
          duplicateReturnedExisting: true,
          ordinaryUserExecuteForbidden: true,
          privacyOnlyAfterApproval: true,
          adminExecuteCompleted: true,
          sessionRevoked: true
        }
      })
    );
  } finally {
    if (deletionRequestId) {
      await admin.query(
        `update public.deletion_requests set handled_by = null where id = $1`,
        [deletionRequestId]
      );
      await admin.query(`delete from public.deletion_requests where id = $1`, [
        deletionRequestId
      ]);
    }
    await admin.query(`delete from auth."user" where id = $1`, [userId]);
    await admin.query(`delete from public.user_profiles where user_id = $1`, [adminId]);
    if (inviteId) {
      await admin.query(`delete from public.invite_codes where id = $1`, [inviteId]);
    }
    if (schoolId) {
      await admin.query(`delete from public.schools where id = $1`, [schoolId]);
    }
    await admin.query(`delete from auth."user" where id = $1`, [adminId]);
    await admin.end();
  }
}

void main();
