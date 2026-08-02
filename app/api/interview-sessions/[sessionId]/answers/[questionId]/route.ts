import { NextResponse } from "next/server";

import { requireActiveUser } from "@/lib/auth/user";
import {
  InterviewPersistenceError,
  saveInterviewAnswer
} from "@/lib/persistence/interviewSessions";
import { persistenceErrorResponse } from "@/lib/persistence/http";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";
import type { InputMode, SttStatus } from "@/lib/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string; questionId: string }>;
};

const inputModes = new Set<InputMode>(["voice", "text", "edited"]);
const sttStatuses = new Set<SttStatus>([
  "idle",
  "recording",
  "success",
  "failed",
  "unsupported",
  "manual"
]);

async function handlePut(request: Request, context: RouteContext) {
  try {
    const profile = await requireActiveUser(request);
    const { sessionId, questionId } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    if (
      typeof payload.answerText !== "string" ||
      !inputModes.has(payload.inputMode as InputMode) ||
      !Number.isInteger(payload.durationSec) ||
      Number(payload.durationSec) < 0 ||
      Number(payload.durationSec) > 7200 ||
      !sttStatuses.has(payload.sttStatus as SttStatus) ||
      typeof payload.idempotencyKey !== "string"
    ) {
      throw new InterviewPersistenceError("INPUT_INVALID", 400);
    }
    const snapshot = await saveInterviewAnswer({
      userId: profile.userId,
      sessionId,
      questionId,
      answer: {
        answerText: payload.answerText,
        inputMode: payload.inputMode as InputMode,
        durationSec: Number(payload.durationSec),
        sttStatus: payload.sttStatus as SttStatus
      },
      idempotencyKey: payload.idempotencyKey
    });
    return NextResponse.json(okResponse(snapshot));
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  return observeRoute(
    request,
    { route: "/api/interview-sessions/:sessionId/answers/:questionId", critical: true },
    () => handlePut(request, context)
  );
}
