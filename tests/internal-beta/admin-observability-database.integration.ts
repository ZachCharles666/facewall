import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { createInviteCode, createInviteCodes, createSchool } = await import("../../lib/admin/operations");
  const { getAdminMetrics } = await import("../../lib/admin/metrics");
  const { getAdminPool, getRuntimePool } = await import("../../lib/db/pool");
  const { recordApiRequestMetric } = await import("../../lib/observability/metrics");
  const {
    defaultAlertThresholds,
    evaluateAlertSnapshot,
    readAlertSnapshot
  } = await import(
    "../../lib/observability/alerts"
  );

  const adminPool = getAdminPool();
  const runtimePool = getRuntimePool();
  const suffix = randomUUID().slice(0, 8);
  const adminUserId = `ib06-admin-${suffix}`;
  const userId = `ib06-user-${suffix}`;
  const schoolCode = `ib06-${suffix}`;
  const requestIds = {
    school: `ib06-school-${randomUUID()}`,
    invite: `ib06-invite-${randomUUID()}`,
    inviteBatch: `ib06-invite-batch-${randomUUID()}`,
    metric: `ib06-metric-${randomUUID()}`
  };
  const alertMetricIds: string[] = [];
  let schoolId = "";
  let inviteId = "";
  let batchInviteIds: string[] = [];
  let sessionId = "";
  let deletionId = "";

  try {
    await adminPool.query(
      `insert into auth."user"(
         id, name, email, "emailVerified", "createdAt", "updatedAt"
       ) values ($1, '', $2, true, now(), now())`,
      [adminUserId, `${adminUserId}@example.test`]
    );
    const school = await createSchool({
      adminUserId,
      requestId: requestIds.school,
      code: schoolCode,
      name: "IB06 Fixture School",
      emailDomains: ["fixture.example.test"]
    });
    schoolId = school.id;
    const invite = await createInviteCode({
      adminUserId,
      requestId: requestIds.invite,
      schoolId,
      codeHash: `fixture-hash-${suffix}`,
      label: "ib06-fixture",
      maxUses: 10,
      sessionLimitPerUser: 3,
      expiresAt: null
    });
    inviteId = invite.id;
    const batchInvites = await createInviteCodes({
      adminUserId,
      requestId: requestIds.inviteBatch,
      schoolId,
      codeHashes: [
        `fixture-batch-hash-a-${suffix}`,
        `fixture-batch-hash-b-${suffix}`
      ],
      label: "ib06-batch-fixture",
      maxUses: 1,
      sessionLimitPerUser: 3,
      expiresAt: null
    });
    batchInviteIds = batchInvites.map((row) => row.id);
    assert.equal(batchInvites.length, 2);
    assert.equal(batchInvites.every((row) => row.max_uses === 1), true);

    sessionId = randomUUID();
    deletionId = randomUUID();
    await adminPool.query("begin");
    try {
      await adminPool.query(
        `insert into auth."user"(
           id, name, email, "emailVerified", "createdAt", "updatedAt"
         ) values ($1, '', $2, true, now(), now())`,
        [userId, `${userId}@example.test`]
      );
      await adminPool.query(
        `insert into public.user_profiles(
           user_id, school_id, invite_code_id, email_normalized, role, status,
           session_limit, sessions_started
         ) values ($1, $2, $3, $4, 'user', 'active', 3, 1)`,
        [userId, schoolId, inviteId, `${userId}@example.test`]
      );
      await adminPool.query(
        `insert into public.interview_sessions(
           id, user_id, school_id, status, version, schema_version, idempotency_key,
           resume_text, jd_text, interviewer_style_id, generation_source,
           started_at, completed_at
         ) values ($1, $2, $3, 'completed', 6, 1, $4, $5, $6, 'strictHr',
                   'demo_fallback', now() - interval '2 minutes', now())`,
        [
          sessionId,
          userId,
          schoolId,
          randomUUID(),
          "fixture resume content for integration only",
          "fixture job description content for integration only"
        ]
      );
      await adminPool.query(
        `insert into public.feedback(
           session_id, school_id, user_id, rating, comment
         ) values ($1, $2, $3, 4, null)`,
        [sessionId, schoolId, userId]
      );
      await adminPool.query(
        `insert into public.product_events(
           user_id, school_id, session_id, event_name, source, idempotency_key,
           properties, occurred_at
         ) values
           ($1, $2, $3, 'dependency_failed', 'server', $4, $5::jsonb, now()),
           ($1, $2, $3, 'report_generated', 'server', $6, $7::jsonb, now())`,
        [
          userId,
          schoolId,
          sessionId,
          `failure-${suffix}`,
          JSON.stringify({ dependency: "llm", operation: "report", retryable: true }),
          `report-${suffix}`,
          JSON.stringify({ inputTokens: 120, outputTokens: 80, latencyMs: 400 })
        ]
      );
      await adminPool.query(
        `insert into public.deletion_requests(id, user_id, status)
         values ($1, $2, 'requested')`,
        [deletionId, userId]
      );
      await adminPool.query("commit");
    } catch (error) {
      await adminPool.query("rollback");
      throw error;
    }

    assert.equal(
      await recordApiRequestMetric({
        requestId: requestIds.metric,
        route: "/api/interview-sessions",
        method: "POST",
        statusCode: 201,
        durationMs: 125
      }),
      true
    );
    for (let index = 0; index < 3; index += 1) {
      const requestId = `ib06-auth-failure-${randomUUID()}`;
      alertMetricIds.push(requestId);
      await recordApiRequestMetric({
        requestId,
        route: "/api/auth/session",
        method: "GET",
        statusCode: 503,
        durationMs: 80 + index,
        errorCode: index === 0 ? "PERSISTENCE_FAILED" : "AUTH_SERVICE_UNAVAILABLE"
      });
    }
    const alertBaseline = await readAlertSnapshot(5);
    const requiredCriticalFailures = Math.max(
      1,
      Math.ceil(
        (
          defaultAlertThresholds.criticalFailureRate *
            alertBaseline.criticalRequests -
          alertBaseline.criticalFailures
        ) /
          (1 - defaultAlertThresholds.criticalFailureRate)
      ),
      defaultAlertThresholds.criticalMinimumRequests -
        alertBaseline.criticalRequests
    );
    for (let index = 0; index < requiredCriticalFailures; index += 1) {
      const requestId = `ib06-critical-${randomUUID()}`;
      alertMetricIds.push(requestId);
      await recordApiRequestMetric({
        requestId,
        route: "/api/interview-sessions",
        method: "POST",
        statusCode: 503,
        durationMs: 90 + index,
        errorCode: "PERSISTENCE_FAILED"
      });
    }
    const frontendMetricId = `ib06-frontend-${randomUUID()}`;
    alertMetricIds.push(frontendMetricId);
    await recordApiRequestMetric({
      requestId: frontendMetricId,
      route: "/api/monitor/client-error",
      method: "POST",
      statusCode: 200,
      durationMs: 20
    });

    const metrics = await getAdminMetrics({
      from: new Date(Date.now() - 60 * 60 * 1000),
      to: new Date(Date.now() + 60 * 1000),
      schoolId
    });
    assert.equal(metrics.users.registered, 1);
    assert.equal(metrics.users.active, 1);
    assert.equal(metrics.sessions.started, 1);
    assert.equal(metrics.sessions.completed, 1);
    assert.equal(metrics.sessions.fallback, 1);
    assert.equal(metrics.sessions.dependencyFailures, 1);
    assert.equal(metrics.feedback.count, 1);
    assert.equal(metrics.quota.granted, 3);
    assert.equal(metrics.quota.used, 1);
    assert.equal(metrics.usage.inputTokens, 120);
    assert.equal(metrics.usage.outputTokens, 80);
    assert.equal(metrics.deletions.pending >= 1, true);
    assert.equal(metrics.apiLatency.count >= 1, true);
    assert.equal(metrics.apiLatency.p50Ms >= 0, true);
    assert.equal(metrics.apiLatency.p95Ms >= metrics.apiLatency.p50Ms, true);

    const alertSnapshot = await readAlertSnapshot(5);
    const alertSignals = evaluateAlertSnapshot(alertSnapshot);
    for (const code of [
      "AUTH_UNAVAILABLE",
      "CRITICAL_API_HIGH_FAILURE_RATE",
      "DATABASE_UNAVAILABLE",
      "SEVERE_FRONTEND_ERROR"
    ]) {
      assert.equal(
        alertSignals.find((signal) => signal.code === code)?.triggered,
        true,
        `${code} was not triggered: ${JSON.stringify(alertSnapshot)}`
      );
    }

    const failedSchoolCode = `ib06-rollback-${suffix}`;
    await assert.rejects(
      createSchool(
        {
          adminUserId,
          requestId: `ib06-rollback-${randomUUID()}`,
          code: failedSchoolCode,
          name: "Must Roll Back",
          emailDomains: []
        },
        { failAfterMutation: true }
      ),
      /IB06_ADMIN_TRANSACTION_FAULT/
    );
    const rolledBack = await adminPool.query(
      "select count(*)::int as count from public.schools where code = $1",
      [failedSchoolCode]
    );
    assert.equal(rolledBack.rows[0].count, 0);

    const audits = await adminPool.query(
      `select action, request_id, metadata
         from public.admin_audit_logs
        where request_id = any($1::text[])
        order by occurred_at`,
      [[requestIds.school, requestIds.invite, requestIds.inviteBatch]]
    );
    assert.deepEqual(
      audits.rows.map((row) => row.action),
      ["school.create", "invite.create", "invite.create", "invite.create"]
    );
    const auditText = JSON.stringify(audits.rows);
    assert.equal(auditText.includes(`fixture-hash-${suffix}`), false);
    assert.equal(auditText.includes(`fixture-batch-hash-a-${suffix}`), false);

    const runtimeClient = await runtimePool.connect();
    let ordinaryUserAuditRows = -1;
    try {
      await runtimeClient.query("begin");
      await runtimeClient.query("select set_config('app.user_id', $1, true)", [userId]);
      const runtimeRows = await runtimeClient.query(
        "select count(*)::int as count from public.admin_audit_logs"
      );
      ordinaryUserAuditRows = runtimeRows.rows[0].count;
      await runtimeClient.query("rollback");
    } finally {
      runtimeClient.release();
    }
    assert.equal(ordinaryUserAuditRows, 0);

    console.log(
      JSON.stringify({
        ok: true,
        metrics: {
          registered: metrics.users.registered,
          started: metrics.sessions.started,
          completed: metrics.sessions.completed,
          p50Ms: metrics.apiLatency.p50Ms,
          p95Ms: metrics.apiLatency.p95Ms
        },
        audits: audits.rowCount,
        ordinaryUserAuditRows,
        alertsTriggered: alertSignals.filter((signal) => signal.triggered).length,
        transactionRollback: true
      })
    );
  } finally {
    await adminPool.query("delete from public.deletion_requests where id = $1", [
      deletionId || null
    ]);
    await adminPool.query("delete from public.feedback where session_id = $1", [
      sessionId || null
    ]);
    await adminPool.query("delete from public.product_events where session_id = $1", [
      sessionId || null
    ]);
    await adminPool.query("delete from public.interview_sessions where id = $1", [
      sessionId || null
    ]);
    await adminPool.query("delete from public.user_profiles where user_id = $1", [
      userId
    ]);
    await adminPool.query("delete from auth.\"user\" where id = $1", [userId]);
    await adminPool.query("delete from public.invite_codes where id = $1", [
      inviteId || null
    ]);
    await adminPool.query(
      "delete from public.invite_codes where id = any($1::uuid[])",
      [batchInviteIds]
    );
    await adminPool.query("delete from public.schools where id = $1", [
      schoolId || null
    ]);
    await adminPool.query(
      "delete from public.api_request_metrics where request_id = any($1::text[])",
      [[requestIds.metric, ...alertMetricIds]]
    );
    await adminPool.query(
      "delete from public.admin_audit_logs where request_id = any($1::text[])",
      [[requestIds.school, requestIds.invite, requestIds.inviteBatch]]
    );
    await adminPool.query("delete from auth.\"user\" where id = $1", [adminUserId]);
    await Promise.all([adminPool.end(), runtimePool.end()]);
  }
}

void main();
