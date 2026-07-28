import "server-only";

import type { PoolClient } from "pg";

import {
  insertAdminAudit,
  recordAdminAuditFailure
} from "@/lib/admin/audit";
import { hashOtpRateKey } from "@/lib/auth/challenge";
import { readAuthConfig } from "@/lib/config/internalBeta";
import { withAdminTransaction, withUserTransaction } from "@/lib/db/context";
import { PrivacyError } from "@/lib/privacy/consent";

export type DeletionStatus =
  | "requested"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "rejected";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function toIso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function mapDeletion(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    status: row.status as DeletionStatus,
    requestedAt: toIso(row.requested_at as Date | string),
    resolvedAt: toIso((row.resolved_at as Date | string | null) ?? null),
    reason: row.reason ? String(row.reason) : null,
    failureCode: row.failure_code ? String(row.failure_code) : null,
    auditSummary: row.audit_summary ?? null
  };
}

export async function getLatestDeletionRequest(userId: string) {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `select id, status, requested_at, resolved_at, reason, failure_code, audit_summary
         from public.deletion_requests
        where user_id = $1
        order by requested_at desc
        limit 1`,
      [userId]
    );
    return result.rows[0] ? mapDeletion(result.rows[0]) : null;
  });
}

export async function createDeletionRequest(input: {
  userId: string;
  idempotencyKey: unknown;
  reason: unknown;
}) {
  if (!isUuid(input.idempotencyKey)) throw new PrivacyError("INPUT_INVALID", 400);
  if (
    input.reason !== undefined &&
    input.reason !== null &&
    (typeof input.reason !== "string" || input.reason.length > 500)
  ) {
    throw new PrivacyError("INPUT_INVALID", 400);
  }
  return withUserTransaction(input.userId, async (client) => {
    const active = await client.query(
      `select id, status, requested_at, resolved_at, reason, failure_code, audit_summary
         from public.deletion_requests
        where user_id = $1 and status in ('requested', 'approved', 'executing')
        order by requested_at desc
        limit 1`,
      [input.userId]
    );
    if (active.rows[0]) return mapDeletion(active.rows[0]);

    await client.query(
      `insert into public.deletion_requests(id, user_id, reason)
       values ($1, $2, $3)
       on conflict do nothing`,
      [
        input.idempotencyKey,
        input.userId,
        typeof input.reason === "string" && input.reason.trim()
          ? input.reason.trim()
          : null
      ]
    );
    const result = await client.query(
      `select id, status, requested_at, resolved_at, reason, failure_code, audit_summary
         from public.deletion_requests
        where id = $1 and user_id = $2`,
      [input.idempotencyKey, input.userId]
    );
    if (!result.rows[0]) throw new PrivacyError("PRIVACY_OPERATION_FAILED", 500, true);
    return mapDeletion(result.rows[0]);
  });
}

async function lockAdminRequest(client: PoolClient, requestId: string) {
  if (!isUuid(requestId)) throw new PrivacyError("RESOURCE_NOT_FOUND", 404);
  const result = await client.query(
    `select d.*, p.status as profile_status
       from public.deletion_requests d
       left join public.user_profiles p on p.user_id = d.user_id
      where d.id = $1
      for update of d`,
    [requestId]
  );
  if (!result.rows[0]) throw new PrivacyError("RESOURCE_NOT_FOUND", 404);
  return result.rows[0] as Record<string, unknown>;
}

export async function approveDeletionRequest(input: {
  requestId: string;
  adminUserId: string;
  auditRequestId?: string;
}) {
  return withAdminTransaction(async (client) => {
    const row = await lockAdminRequest(client, input.requestId);
    if (row.status === "approved") {
      await insertAdminAudit(client, {
        adminUserId: input.adminUserId,
        requestId: input.auditRequestId ?? input.requestId,
        action: "deletion.approve",
        targetType: "deletion_request",
        targetId: input.requestId,
        outcome: "succeeded",
        metadata: { idempotentReplay: true }
      });
      return mapDeletion(row);
    }
    if (row.status !== "requested" && row.status !== "failed") {
      throw new PrivacyError("INVALID_STATE_TRANSITION", 409);
    }
    if (!row.user_id) throw new PrivacyError("INVALID_STATE_TRANSITION", 409);
    await client.query(
      `update public.user_profiles
          set status = 'deletion_pending'
        where user_id = $1 and status in ('active', 'deletion_pending')`,
      [row.user_id]
    );
    const result = await client.query(
      `update public.deletion_requests
          set status = 'approved', handled_by = $2, failure_code = null,
              resolved_at = null
        where id = $1
        returning *`,
      [input.requestId, input.adminUserId]
    );
    await insertAdminAudit(client, {
      adminUserId: input.adminUserId,
      requestId: input.auditRequestId ?? input.requestId,
      action: "deletion.approve",
      targetType: "deletion_request",
      targetId: input.requestId,
      outcome: "succeeded"
    });
    return mapDeletion(result.rows[0]);
  });
}

async function markExecuting(requestId: string, adminUserId: string) {
  return withAdminTransaction(async (client) => {
    const row = await lockAdminRequest(client, requestId);
    if (row.status !== "approved" && row.status !== "executing") {
      throw new PrivacyError("INVALID_STATE_TRANSITION", 409);
    }
    if (!row.user_id) throw new PrivacyError("INVALID_STATE_TRANSITION", 409);
    if (row.status === "executing") return row;
    const result = await client.query(
      `update public.deletion_requests
          set status = 'executing', handled_by = $2, failure_code = null
        where id = $1
        returning *`,
      [requestId, adminUserId]
    );
    return result.rows[0] as Record<string, unknown>;
  });
}

async function deleteRows(
  client: PoolClient,
  table: string,
  userId: string,
  faultAfterTable?: string
) {
  const result = await client.query(`delete from ${table} where user_id = $1`, [userId]);
  if (faultAfterTable === table) throw new Error("IB04_FIXTURE_FAULT");
  return result.rowCount ?? 0;
}

export async function executeDeletionRequest(
  input: {
    requestId: string;
    adminUserId: string;
    auditRequestId?: string;
  },
  testOptions: { faultAfterTable?: string } = {}
) {
  const request = await markExecuting(input.requestId, input.adminUserId);
  const userId = String(request.user_id);
  try {
    return await withAdminTransaction(async (client) => {
      const identity = await client.query(
        `select email from auth."user" where id = $1 for update`,
        [userId]
      );
      if (!identity.rows[0]) throw new PrivacyError("INVALID_STATE_TRANSITION", 409);
      const email = String(identity.rows[0].email).trim().toLowerCase();
      const counts: Record<string, number> = {};

      counts.interview_answers = await deleteRows(
        client,
        "public.interview_answers",
        userId,
        testOptions.faultAfterTable
      );
      counts.feedback = await deleteRows(
        client,
        "public.feedback",
        userId,
        testOptions.faultAfterTable
      );
      counts.product_events = await deleteRows(
        client,
        "public.product_events",
        userId,
        testOptions.faultAfterTable
      );
      counts.interview_sessions = await deleteRows(
        client,
        "public.interview_sessions",
        userId,
        testOptions.faultAfterTable
      );
      counts.consent_records = await deleteRows(
        client,
        "public.consent_records",
        userId,
        testOptions.faultAfterTable
      );
      counts.user_profiles = await deleteRows(
        client,
        "public.user_profiles",
        userId,
        testOptions.faultAfterTable
      );
      const verification = await client.query(
        `delete from auth.verification
          where identifier = $1 or left(identifier, length($1)) = $1`,
        [email]
      );
      counts.auth_verification = verification.rowCount ?? 0;
      const emailBudget = await client.query(
        `delete from auth.otp_send_counters
          where scope_type = 'email' and scope_hash = $1`,
        [hashOtpRateKey("email", email, readAuthConfig().secret)]
      );
      counts.otp_email_counters = emailBudget.rowCount ?? 0;

      const auditSummary = {
        schemaVersion: 1,
        deletedRows: counts,
        completedAt: new Date().toISOString()
      };
      await client.query(
        `update public.deletion_requests
            set user_id = null, status = 'completed', resolved_at = now(),
                reason = null, failure_code = null, audit_summary = $2::jsonb
          where id = $1 and status = 'executing'`,
        [input.requestId, JSON.stringify(auditSummary)]
      );
      const authUser = await client.query(`delete from auth."user" where id = $1`, [userId]);
      counts.auth_user = authUser.rowCount ?? 0;
      auditSummary.deletedRows = counts;
      const completed = await client.query(
        `update public.deletion_requests
            set audit_summary = $2::jsonb
          where id = $1
          returning *`,
        [input.requestId, JSON.stringify(auditSummary)]
      );
      await insertAdminAudit(client, {
        adminUserId: input.adminUserId,
        requestId: input.auditRequestId ?? input.requestId,
        action: "deletion.execute",
        targetType: "deletion_request",
        targetId: input.requestId,
        outcome: "succeeded",
        metadata: {
          deletedTableCount: Object.keys(counts).length,
          auditUserMappingRemoved: true
        }
      });
      return mapDeletion(completed.rows[0]);
    });
  } catch (error) {
    const failureCode =
      error instanceof PrivacyError ? error.code : "DELETE_TRANSACTION_FAILED";
    await withAdminTransaction((client) =>
      client.query(
        `update public.deletion_requests
            set status = 'failed', failure_code = $2, resolved_at = now()
          where id = $1 and status = 'executing'`,
        [input.requestId, failureCode]
      )
    ).catch(() => undefined);
    await recordAdminAuditFailure({
      adminUserId: input.adminUserId,
      requestId: input.auditRequestId ?? input.requestId,
      action: "deletion.execute",
      targetType: "deletion_request",
      targetId: input.requestId,
      metadata: { failureCode }
    });
    if (error instanceof PrivacyError) throw error;
    throw new PrivacyError("PRIVACY_OPERATION_FAILED", 500, true);
  }
}

export async function listDeletionRequests() {
  return withAdminTransaction(async (client) => {
    const result = await client.query(
      `select id, status, requested_at, resolved_at, reason, failure_code, audit_summary
         from public.deletion_requests
        order by requested_at desc
        limit 100`
    );
    return result.rows.map(mapDeletion);
  });
}
