import "server-only";

import type { PoolClient } from "pg";

import { withAdminTransaction } from "@/lib/db/context";
import { scrubTelemetry } from "@/lib/observability/scrub";

export interface AdminAuditInput {
  adminUserId: string | null;
  requestId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  outcome: "succeeded" | "failed";
  metadata?: Record<string, unknown>;
}

export async function insertAdminAudit(
  client: PoolClient,
  input: AdminAuditInput
) {
  const metadata = scrubTelemetry(input.metadata ?? {});
  await client.query(
    `insert into public.admin_audit_logs(
       admin_user_id, request_id, action, target_type, target_id, outcome, metadata
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      input.adminUserId,
      input.requestId,
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.outcome,
      JSON.stringify(metadata)
    ]
  );
}

export async function recordAdminAudit(input: AdminAuditInput) {
  return withAdminTransaction((client) => insertAdminAudit(client, input));
}

export async function recordAdminAuditFailure(
  input: Omit<AdminAuditInput, "outcome">
) {
  return recordAdminAudit({ ...input, outcome: "failed" }).catch(() => undefined);
}
