import "server-only";

import type { PoolClient } from "pg";

import { withUserTransaction } from "@/lib/db/context";

export type ServerEventName =
  | "session_started"
  | "profile_generated"
  | "questions_generated"
  | "answer_saved"
  | "report_generated"
  | "session_completed"
  | "feedback_submitted"
  | "dependency_failed";

export type ClientEventName =
  | "page_viewed"
  | "consent_viewed"
  | "report_viewed"
  | "copy_succeeded"
  | "copy_failed"
  | "feedback_skipped";

const clientSchemas: Record<ClientEventName, Set<string>> = {
  page_viewed: new Set(["step", "theme"]),
  consent_viewed: new Set(["policyVersion"]),
  report_viewed: new Set(["theme"]),
  copy_succeeded: new Set(["target", "theme"]),
  copy_failed: new Set(["target", "theme"]),
  feedback_skipped: new Set(["theme"])
};

const clientEvents = new Set(Object.keys(clientSchemas));

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function validateProperties(eventName: ClientEventName, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const properties = value as Record<string, unknown>;
  if (Object.keys(properties).some((key) => !clientSchemas[eventName].has(key))) {
    return false;
  }
  return Object.values(properties).every(
    (item) =>
      typeof item === "string" &&
      item.length > 0 &&
      item.length <= 64
  );
}

export function validateClientEvent(value: Record<string, unknown>) {
  if (
    typeof value.eventName !== "string" ||
    !clientEvents.has(value.eventName) ||
    !isUuid(value.idempotencyKey)
  ) {
    return null;
  }
  const eventName = value.eventName as ClientEventName;
  if (!validateProperties(eventName, value.properties)) return null;
  if (
    value.sessionId !== null &&
    value.sessionId !== undefined &&
    !isUuid(value.sessionId)
  ) {
    return null;
  }
  return {
    eventName,
    sessionId:
      typeof value.sessionId === "string" ? value.sessionId : null,
    idempotencyKey: value.idempotencyKey,
    properties: value.properties as Record<string, string>
  };
}

export async function insertServerEvent(
  client: PoolClient,
  input: {
    userId: string;
    schoolId: string;
    sessionId: string | null;
    eventName: ServerEventName;
    idempotencyKey: string;
    properties: Record<string, string | number | boolean | null>;
  }
) {
  await client.query(
    `insert into public.product_events(
       user_id, school_id, session_id, event_name, source,
       idempotency_key, properties, occurred_at
     ) values ($1, $2, $3, $4, 'server', $5, $6::jsonb, now())
     on conflict do nothing`,
    [
      input.userId,
      input.schoolId,
      input.sessionId,
      input.eventName,
      input.idempotencyKey,
      JSON.stringify(input.properties)
    ]
  );
}

export async function recordClientEvent(
  userId: string,
  schoolId: string,
  payload: ReturnType<typeof validateClientEvent>
) {
  if (!payload) throw new Error("INPUT_INVALID");
  return withUserTransaction(userId, async (client) => {
    if (payload.sessionId) {
      const owned = await client.query(
        `select 1 from public.interview_sessions
          where id = $1 and user_id = $2`,
        [payload.sessionId, userId]
      );
      if (!owned.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    }
    const result = await client.query(
      `insert into public.product_events(
         user_id, school_id, session_id, event_name, source,
         idempotency_key, properties, occurred_at
       ) values ($1, $2, $3, $4, 'client', $5, $6::jsonb, now())
       on conflict do nothing
       returning id`,
      [
        userId,
        schoolId,
        payload.sessionId,
        payload.eventName,
        payload.idempotencyKey,
        JSON.stringify(payload.properties)
      ]
    );
    return { recorded: Boolean(result.rows[0]) };
  });
}
