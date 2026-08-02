import assert from "node:assert/strict";

import { loadEnvConfig } from "@next/env";

import { hashOtpRateKey } from "../../lib/auth/challenge";
import { readAuthConfig } from "../../lib/config/internalBeta";
import { getAdminPool, getRuntimePool } from "../../lib/db/pool";
import {
  acceptCurrentConsent,
  getCurrentConsent,
  PrivacyError
} from "../../lib/privacy/consent";
import {
  approveDeletionRequest,
  createDeletionRequest,
  executeDeletionRequest,
  getLatestDeletionRequest
} from "../../lib/privacy/deletion";
import { CURRENT_PRIVACY_POLICY } from "../../lib/privacy/policy";
import { createInterviewSession } from "../../lib/persistence/interviewSessions";

loadEnvConfig(process.cwd());
process.env.INTERNAL_BETA_AUTH_ENABLED = "true";
process.env.INTERNAL_BETA_REQUIRE_CONSENT = "true";

const adminPool = getAdminPool();
const runtimePool = getRuntimePool();

async function insertAuthUser(id: string, email: string) {
  await adminPool.query(
    `insert into auth."user"(
       id, name, email, "emailVerified", "createdAt", "updatedAt"
     ) values ($1, $1, $2, true, now(), now())`,
    [id, email]
  );
}

async function main() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const adminId = `ib04-admin-${suffix}`;
  const userSuccess = `ib04-success-${suffix}`;
  const userRetry = `ib04-retry-${suffix}`;
  const successEmail = `${userSuccess}@example.test`;
  const retryEmail = `${userRetry}@example.test`;
  let schoolId = "";
  let inviteId = "";
  const requestIds: string[] = [];

  try {
    await adminPool.query(
      `delete from public.admin_audit_logs
        where admin_user_id like 'ib04-admin-%'`
    );
    await insertAuthUser(adminId, `${adminId}@example.test`);
    await insertAuthUser(userSuccess, successEmail);
    await insertAuthUser(userRetry, retryEmail);

    const school = await adminPool.query(
      `insert into public.schools(code, name)
       values ($1, 'IB-04 staging fixture')
       returning id`,
      [`ib04-${suffix}`]
    );
    schoolId = String(school.rows[0].id);
    const invite = await adminPool.query(
      `insert into public.invite_codes(
         school_id, code_hash, label, max_uses, created_by
       ) values ($1, $2, 'IB-04 fixture', 3, $3)
       returning id`,
      [schoolId, `ib04-hash-${suffix}`, adminId]
    );
    inviteId = String(invite.rows[0].id);
    for (const [userId, email, role] of [
      [adminId, `${adminId}@example.test`, "admin"],
      [userSuccess, successEmail, "user"],
      [userRetry, retryEmail, "user"]
    ]) {
      await adminPool.query(
        `insert into public.user_profiles(
           user_id, school_id, invite_code_id, email_normalized, role
         ) values ($1, $2, $3, $4, $5)`,
        [userId, schoolId, inviteId, email, role]
      );
    }

    await adminPool.query(
      `insert into public.consent_records(
         user_id, policy_version, consent_scope, accepted_at, request_id
       ) values ($1, '2026-06', array['interview_delivery'], now(), $2)`,
      [userRetry, crypto.randomUUID()]
    );
    assert.equal((await getCurrentConsent(userRetry)).accepted, false);
    await assert.rejects(
      acceptCurrentConsent({
        userId: userRetry,
        policyVersion: "2026-06",
        scopes: [...CURRENT_PRIVACY_POLICY.scopes],
        idempotencyKey: crypto.randomUUID()
      }),
      (error) =>
        error instanceof PrivacyError && error.code === "POLICY_VERSION_OUTDATED"
    );
    await assert.rejects(
      createInterviewSession({
        userId: userRetry,
        resumeText: "IB-04 fixture resume content long enough",
        jdText: "IB-04 fixture job description long enough",
        interviewerStyleId: "strictHr",
        idempotencyKey: crypto.randomUUID()
      }),
      /CONSENT_REQUIRED/
    );

    const consentKey = crypto.randomUUID();
    const firstConsent = await acceptCurrentConsent({
      userId: userSuccess,
      policyVersion: CURRENT_PRIVACY_POLICY.version,
      scopes: [...CURRENT_PRIVACY_POLICY.scopes],
      idempotencyKey: consentKey
    });
    const repeatedConsent = await acceptCurrentConsent({
      userId: userSuccess,
      policyVersion: CURRENT_PRIVACY_POLICY.version,
      scopes: [...CURRENT_PRIVACY_POLICY.scopes],
      idempotencyKey: crypto.randomUUID()
    });
    assert.equal(repeatedConsent.id, firstConsent.id);
    const consentCount = await adminPool.query(
      `select count(*)::int as count
         from public.consent_records
        where user_id = $1 and policy_version = $2`,
      [userSuccess, CURRENT_PRIVACY_POLICY.version]
    );
    assert.equal(consentCount.rows[0].count, 1);

    await acceptCurrentConsent({
      userId: userRetry,
      policyVersion: CURRENT_PRIVACY_POLICY.version,
      scopes: [...CURRENT_PRIVACY_POLICY.scopes],
      idempotencyKey: crypto.randomUUID()
    });
    const versionCount = await adminPool.query(
      `select count(*)::int as count
         from public.consent_records
        where user_id = $1`,
      [userRetry]
    );
    assert.equal(versionCount.rows[0].count, 2);

    const successSession = await createInterviewSession({
      userId: userSuccess,
      resumeText: "IB-04 fixture resume content long enough",
      jdText: "IB-04 fixture job description long enough",
      interviewerStyleId: "techBro",
      idempotencyKey: crypto.randomUUID()
    });
    await adminPool.query(
      `insert into public.interview_answers(
         session_id, user_id, question_id, answer_text, input_mode, stt_status
       ) values ($1, $2, 'q1', 'fixture transcript', 'text', 'manual')`,
      [successSession.sessionId, userSuccess]
    );
    await adminPool.query(
      `insert into public.feedback(
         session_id, user_id, school_id, rating, comment
       ) values ($1, $2, $3, 5, 'fixture feedback')`,
      [successSession.sessionId, userSuccess, schoolId]
    );
    await adminPool.query(
      `insert into auth.verification(
         id, identifier, value, "expiresAt", "createdAt", "updatedAt"
       ) values ($1, $2, 'fixture', now() + interval '1 hour', now(), now())`,
      [`ib04-verification-${suffix}`, `${successEmail}-email-otp-sign-in`]
    );
    await adminPool.query(
      `insert into auth.otp_send_counters(
         scope_type, scope_hash, bucket_date, attempt_count
       ) values ('email', $1, current_date, 1)
       on conflict do nothing`,
      [hashOtpRateKey("email", successEmail, readAuthConfig().secret)]
    );

    const successRequestKey = crypto.randomUUID();
    requestIds.push(successRequestKey);
    const created = await createDeletionRequest({
      userId: userSuccess,
      idempotencyKey: successRequestKey,
      reason: "fixture reason removed on completion"
    });
    const repeated = await createDeletionRequest({
      userId: userSuccess,
      idempotencyKey: crypto.randomUUID(),
      reason: null
    });
    assert.equal(repeated.id, created.id);
    assert.equal((await getLatestDeletionRequest(userSuccess))?.status, "requested");
    await approveDeletionRequest({
      requestId: successRequestKey,
      adminUserId: adminId
    });
    const pending = await adminPool.query(
      `select status from public.user_profiles where user_id = $1`,
      [userSuccess]
    );
    assert.equal(pending.rows[0].status, "deletion_pending");
    const completed = await executeDeletionRequest({
      requestId: successRequestKey,
      adminUserId: adminId
    });
    assert.equal(completed.status, "completed");

    const successResidue = await adminPool.query(
      `select
         (select count(*) from auth."user" where id = $1)::int as auth_user,
         (select count(*) from public.interview_sessions where user_id = $1)::int as sessions,
         (select count(*) from public.interview_answers where user_id = $1)::int as answers,
         (select count(*) from public.consent_records where user_id = $1)::int as consent,
         (select count(*) from public.feedback where user_id = $1)::int as feedback,
         (select count(*) from public.product_events where user_id = $1)::int as events`,
      [userSuccess]
    );
    assert.deepEqual(successResidue.rows[0], {
      auth_user: 0,
      sessions: 0,
      answers: 0,
      consent: 0,
      feedback: 0,
      events: 0
    });
    const audit = await adminPool.query(
      `select user_id, reason, audit_summary
         from public.deletion_requests
        where id = $1`,
      [successRequestKey]
    );
    assert.equal(audit.rows[0].user_id, null);
    assert.equal(audit.rows[0].reason, null);
    assert.equal(audit.rows[0].audit_summary.schemaVersion, 1);
    assert.ok(!JSON.stringify(audit.rows[0].audit_summary).includes(userSuccess));
    assert.ok(!JSON.stringify(audit.rows[0].audit_summary).includes(successEmail));

    const retrySession = await createInterviewSession({
      userId: userRetry,
      resumeText: "IB-04 retry fixture resume content long enough",
      jdText: "IB-04 retry fixture job description long enough",
      interviewerStyleId: "gentleSister",
      idempotencyKey: crypto.randomUUID()
    });
    const retryRequestKey = crypto.randomUUID();
    requestIds.push(retryRequestKey);
    await createDeletionRequest({
      userId: userRetry,
      idempotencyKey: retryRequestKey,
      reason: null
    });
    await approveDeletionRequest({ requestId: retryRequestKey, adminUserId: adminId });
    await assert.rejects(
      executeDeletionRequest(
        { requestId: retryRequestKey, adminUserId: adminId },
        { faultAfterTable: "public.interview_sessions" }
      ),
      (error) =>
        error instanceof PrivacyError &&
        error.code === "PRIVACY_OPERATION_FAILED"
    );
    const failed = await adminPool.query(
      `select status, failure_code from public.deletion_requests where id = $1`,
      [retryRequestKey]
    );
    assert.equal(failed.rows[0].status, "failed");
    assert.equal(failed.rows[0].failure_code, "DELETE_TRANSACTION_FAILED");
    const rollbackPreserved = await adminPool.query(
      `select count(*)::int as count
         from public.interview_sessions
        where id = $1 and user_id = $2`,
      [retrySession.sessionId, userRetry]
    );
    assert.equal(rollbackPreserved.rows[0].count, 1);
    await approveDeletionRequest({ requestId: retryRequestKey, adminUserId: adminId });
    const retried = await executeDeletionRequest({
      requestId: retryRequestKey,
      adminUserId: adminId
    });
    assert.equal(retried.status, "completed");

    console.log(
      JSON.stringify({
        ok: true,
        fixtureOnly: true,
        policyVersion: CURRENT_PRIVACY_POLICY.version,
        consent: {
          idempotentRows: 1,
          historicalVersionsPreserved: 2,
          oldVersionRejected: true
        },
        sessionGate: { unconsentedRejected: true },
        deletion: {
          duplicateRequestReturnedExisting: true,
          completed: true,
          userIdentityRemoved: true,
          auditUserMappingRemoved: true,
          faultRolledBack: true,
          failedStateRetryCompleted: true
        },
        deletedRows: completed.auditSummary
      })
    );
  } finally {
    await adminPool.query(
      `delete from public.admin_audit_logs where admin_user_id = $1`,
      [adminId]
    );
    if (requestIds.length) {
      await adminPool.query(
        `update public.deletion_requests
            set handled_by = null
          where id = any($1::uuid[])`,
        [requestIds]
      );
      await adminPool.query(
        `delete from public.deletion_requests where id = any($1::uuid[])`,
        [requestIds]
      );
    }
    await adminPool.query(
      `delete from auth."user" where id = any($1::text[])`,
      [[userSuccess, userRetry]]
    );
    await adminPool.query(
      `delete from public.user_profiles where user_id = $1`,
      [adminId]
    );
    if (inviteId) {
      await adminPool.query(`delete from public.invite_codes where id = $1`, [inviteId]);
    }
    if (schoolId) {
      await adminPool.query(`delete from public.schools where id = $1`, [schoolId]);
    }
    await adminPool.query(`delete from auth."user" where id = $1`, [adminId]);
    await Promise.all([runtimePool.end(), adminPool.end()]);
  }
}

void main();
