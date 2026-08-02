import "server-only";

import { insertServerEvent } from "@/lib/analytics/events";
import { withUserTransaction } from "@/lib/db/context";
import {
  type QuestionnaireAnswers,
  validateQuestionnaireAnswers
} from "@/lib/questionnaire/schema";
import { readQuestionnaireConfig } from "@/lib/questionnaire/store";

export class QuestionnaireError extends Error {
  constructor(
    public readonly code:
      | "INPUT_INVALID"
      | "RESOURCE_NOT_FOUND"
      | "INVALID_STATE_TRANSITION"
      | "QUESTIONNAIRE_NOT_ELIGIBLE"
      | "QUESTIONNAIRE_VERSION_OUTDATED"
      | "QUESTIONNAIRE_FAILED",
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

function mapResponse(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    questionnaireVersion: String(row.questionnaire_version),
    answers: row.answers as QuestionnaireAnswers,
    createdAt: new Date(row.created_at as Date | string).toISOString()
  };
}

async function readEligibility(
  client: import("pg").PoolClient,
  userId: string,
  sessionId: string,
  lock = false
) {
  const result = await client.query(
    `select s.id, s.school_id, s.status, s.completed_at,
            exists (
              select 1
                from public.questionnaire_responses qr
               where qr.user_id = $2
            ) as already_submitted,
            exists (
              select 1
                from public.interview_sessions earlier
               where earlier.user_id = $2
                 and earlier.id <> s.id
                 and earlier.status = 'completed'
                 and (
                   s.completed_at is null or
                   earlier.completed_at <= s.completed_at
                 )
            ) as earlier_completed
       from public.interview_sessions s
      where s.id = $1 and s.user_id = $2
      ${lock ? "for update" : ""}`,
    [sessionId, userId]
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new QuestionnaireError("RESOURCE_NOT_FOUND", 404);
  const reportReady = ["report_ready", "completed"].includes(String(row.status));
  return {
    row,
    eligible:
      reportReady &&
      !Boolean(row.already_submitted) &&
      !Boolean(row.earlier_completed)
  };
}

export async function getSessionQuestionnaire(userId: string, sessionId: string) {
  if (!isUuid(sessionId)) throw new QuestionnaireError("RESOURCE_NOT_FOUND", 404);
  const config = await readQuestionnaireConfig();
  return withUserTransaction(userId, async (client) => {
    const eligibility = await readEligibility(client, userId, sessionId);
    const response = await client.query(
      `select id, session_id, questionnaire_version, answers, created_at
         from public.questionnaire_responses
        where user_id = $1`,
      [userId]
    );
    return {
      config,
      eligible: eligibility.eligible,
      response: response.rows[0] ? mapResponse(response.rows[0]) : null
    };
  });
}

function findLegacyFeedback(
  answers: QuestionnaireAnswers,
  config: Awaited<ReturnType<typeof readQuestionnaireConfig>>
) {
  const ratingQuestion = config.questions.find((question) => question.type === "rating");
  const textQuestion = config.questions.find((question) => question.type === "text");
  const rating = ratingQuestion ? answers[ratingQuestion.id] : undefined;
  const comment = textQuestion ? answers[textQuestion.id] : undefined;
  return {
    rating: typeof rating === "number" ? rating : null,
    comment: typeof comment === "string" && comment ? comment : null
  };
}

export async function submitSessionQuestionnaire(input: {
  userId: string;
  schoolId: string;
  sessionId: string;
  questionnaireVersion: unknown;
  answers: unknown;
  idempotencyKey: unknown;
  databaseFault?: boolean;
}) {
  if (
    !isUuid(input.sessionId) ||
    !isUuid(input.idempotencyKey) ||
    typeof input.questionnaireVersion !== "string"
  ) {
    throw new QuestionnaireError("INPUT_INVALID", 400);
  }
  const config = await readQuestionnaireConfig();
  if (input.questionnaireVersion !== config.version) {
    throw new QuestionnaireError("QUESTIONNAIRE_VERSION_OUTDATED", 409, true);
  }
  const answers = validateQuestionnaireAnswers(config, input.answers);
  if (!answers) throw new QuestionnaireError("INPUT_INVALID", 400);

  return withUserTransaction(input.userId, async (client) => {
    if (input.databaseFault) {
      await client.query("set local statement_timeout = '1ms'");
      await client.query("select pg_sleep(0.05)");
    }
    const existing = await client.query(
      `select id, session_id, questionnaire_version, answers, created_at
         from public.questionnaire_responses
        where user_id = $1`,
      [input.userId]
    );
    if (existing.rows[0]) return mapResponse(existing.rows[0]);

    const eligibility = await readEligibility(
      client,
      input.userId,
      input.sessionId,
      true
    );
    if (!eligibility.eligible) {
      throw new QuestionnaireError("QUESTIONNAIRE_NOT_ELIGIBLE", 409);
    }

    const inserted = await client.query(
      `insert into public.questionnaire_responses(
         session_id, user_id, school_id, questionnaire_version, answers
       ) values ($1, $2, $3, $4, $5::jsonb)
       on conflict (user_id) do nothing
       returning id, session_id, questionnaire_version, answers, created_at`,
      [
        input.sessionId,
        input.userId,
        input.schoolId,
        config.version,
        JSON.stringify(answers)
      ]
    );
    if (!inserted.rows[0]) {
      const replay = await client.query(
        `select id, session_id, questionnaire_version, answers, created_at
           from public.questionnaire_responses
          where user_id = $1`,
        [input.userId]
      );
      if (!replay.rows[0]) {
        throw new QuestionnaireError("QUESTIONNAIRE_FAILED", 500, true);
      }
      return mapResponse(replay.rows[0]);
    }

    const legacy = findLegacyFeedback(answers, config);
    if (legacy.rating !== null) {
      await client.query(
        `insert into public.feedback(
           session_id, user_id, school_id, rating, comment
         ) values ($1, $2, $3, $4, $5)
         on conflict (session_id) do nothing`,
        [
          input.sessionId,
          input.userId,
          input.schoolId,
          legacy.rating,
          legacy.comment
        ]
      );
    }
    await insertServerEvent(client, {
      userId: input.userId,
      schoolId: input.schoolId,
      sessionId: input.sessionId,
      eventName: "questionnaire_submitted",
      idempotencyKey: String(input.idempotencyKey),
      properties: {
        questionnaireVersion: config.version,
        questionCount: config.questions.length,
        hasRating: legacy.rating !== null
      }
    });
    return mapResponse(inserted.rows[0]);
  });
}

