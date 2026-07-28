import "server-only";

import { insertServerEvent } from "@/lib/analytics/events";
import { withUserTransaction } from "@/lib/db/context";

export class FeedbackError extends Error {
  constructor(
    public readonly code:
      | "INPUT_INVALID"
      | "RESOURCE_NOT_FOUND"
      | "INVALID_STATE_TRANSITION"
      | "FEEDBACK_FAILED",
    public readonly status: 400 | 404 | 409 | 500,
    public readonly retryable = false
  ) {
    super(code);
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function mapFeedback(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    rating: Number(row.rating),
    comment: row.comment ? String(row.comment) : null,
    createdAt: new Date(row.created_at as Date | string).toISOString()
  };
}

export async function getSessionFeedback(userId: string, sessionId: string) {
  if (!isUuid(sessionId)) throw new FeedbackError("RESOURCE_NOT_FOUND", 404);
  return withUserTransaction(userId, async (client) => {
    const result = await client.query(
      `select id, session_id, rating, comment, created_at
         from public.feedback
        where session_id = $1 and user_id = $2`,
      [sessionId, userId]
    );
    return result.rows[0] ? mapFeedback(result.rows[0]) : null;
  });
}

export async function submitSessionFeedback(input: {
  userId: string;
  schoolId: string;
  sessionId: string;
  rating: unknown;
  comment: unknown;
  idempotencyKey: unknown;
  databaseFault?: boolean;
}) {
  if (
    !isUuid(input.sessionId) ||
    !isUuid(input.idempotencyKey) ||
    !Number.isInteger(input.rating) ||
    Number(input.rating) < 1 ||
    Number(input.rating) > 5 ||
    (input.comment !== null &&
      input.comment !== undefined &&
      (typeof input.comment !== "string" || input.comment.length > 500))
  ) {
    throw new FeedbackError("INPUT_INVALID", 400);
  }
  return withUserTransaction(input.userId, async (client) => {
    if (input.databaseFault) {
      await client.query("set local statement_timeout = '1ms'");
      await client.query("select pg_sleep(0.05)");
    }
    const session = await client.query(
      `select id, school_id, status
         from public.interview_sessions
        where id = $1 and user_id = $2
        for update`,
      [input.sessionId, input.userId]
    );
    const row = session.rows[0];
    if (!row) throw new FeedbackError("RESOURCE_NOT_FOUND", 404);
    if (!["report_ready", "completed"].includes(String(row.status))) {
      throw new FeedbackError("INVALID_STATE_TRANSITION", 409);
    }

    const inserted = await client.query(
      `insert into public.feedback(
         session_id, user_id, school_id, rating, comment
       ) values ($1, $2, $3, $4, $5)
       on conflict (session_id) do nothing
       returning id, session_id, rating, comment, created_at`,
      [
        input.sessionId,
        input.userId,
        input.schoolId,
        input.rating,
        typeof input.comment === "string" && input.comment.trim()
          ? input.comment.trim()
          : null
      ]
    );
    if (inserted.rows[0]) {
      await insertServerEvent(client, {
        userId: input.userId,
        schoolId: input.schoolId,
        sessionId: input.sessionId,
        eventName: "feedback_submitted",
        idempotencyKey: String(input.idempotencyKey),
        properties: { rating: Number(input.rating) }
      });
      return mapFeedback(inserted.rows[0]);
    }
    const existing = await client.query(
      `select id, session_id, rating, comment, created_at
         from public.feedback
        where session_id = $1 and user_id = $2`,
      [input.sessionId, input.userId]
    );
    if (!existing.rows[0]) throw new FeedbackError("FEEDBACK_FAILED", 500, true);
    return mapFeedback(existing.rows[0]);
  });
}
