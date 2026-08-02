import "server-only";

import { withUserTransaction } from "@/lib/db/context";
import { CURRENT_PRIVACY_POLICY } from "@/lib/privacy/policy";

export class PrivacyError extends Error {
  constructor(
    public readonly code:
      | "AUTH_REQUIRED"
      | "ACCOUNT_UNAVAILABLE"
      | "INPUT_INVALID"
      | "POLICY_VERSION_OUTDATED"
      | "RESOURCE_NOT_FOUND"
      | "INVALID_STATE_TRANSITION"
      | "PRIVACY_OPERATION_FAILED",
    public readonly status: 400 | 401 | 403 | 404 | 409 | 500,
    public readonly retryable = false
  ) {
    super(code);
  }
}

function toIso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function sameScopes(scopes: unknown): scopes is string[] {
  if (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === "string")) {
    return false;
  }
  const expected = [...CURRENT_PRIVACY_POLICY.scopes].sort();
  return scopes.length === expected.length && [...scopes].sort().every((scope, index) => scope === expected[index]);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function getCurrentConsent(userId: string) {
  const record = await withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `select id, policy_version, consent_scope, accepted_at, withdrawn_at, request_id
         from public.consent_records
        where user_id = $1 and policy_version = $2`,
      [userId, CURRENT_PRIVACY_POLICY.version]
    );
    return result.rows[0] as Record<string, unknown> | undefined;
  });
  const accepted = Boolean(record && !record.withdrawn_at);
  return {
    policyVersion: CURRENT_PRIVACY_POLICY.version,
    title: CURRENT_PRIVACY_POLICY.title,
    content: CURRENT_PRIVACY_POLICY.content,
    scopes: [...CURRENT_PRIVACY_POLICY.scopes],
    accepted,
    acceptedAt: accepted ? toIso(record?.accepted_at as Date | string) : null
  };
}

export async function acceptCurrentConsent(input: {
  userId: string;
  policyVersion: unknown;
  scopes: unknown;
  idempotencyKey: unknown;
}) {
  if (input.policyVersion !== CURRENT_PRIVACY_POLICY.version) {
    throw new PrivacyError("POLICY_VERSION_OUTDATED", 409);
  }
  if (!sameScopes(input.scopes) || !isUuid(input.idempotencyKey)) {
    throw new PrivacyError("INPUT_INVALID", 400);
  }
  return withUserTransaction(input.userId, async (client) => {
    await client.query(
      `insert into public.consent_records(
         user_id, policy_version, consent_scope, accepted_at, request_id
       )
       values ($1, $2, $3::text[], now(), $4)
       on conflict (user_id, policy_version) do nothing`,
      [
        input.userId,
        CURRENT_PRIVACY_POLICY.version,
        [...CURRENT_PRIVACY_POLICY.scopes],
        input.idempotencyKey
      ]
    );
    const result = await client.query(
      `select id, policy_version, consent_scope, accepted_at, request_id
         from public.consent_records
        where user_id = $1 and policy_version = $2 and withdrawn_at is null`,
      [input.userId, CURRENT_PRIVACY_POLICY.version]
    );
    const row = result.rows[0];
    if (!row) throw new PrivacyError("PRIVACY_OPERATION_FAILED", 500, true);
    return {
      id: String(row.id),
      policyVersion: String(row.policy_version),
      scopes: row.consent_scope as string[],
      acceptedAt: toIso(row.accepted_at as Date | string),
      requestId: String(row.request_id)
    };
  });
}
