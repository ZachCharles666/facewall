import { NextResponse } from "next/server";

import { requireActiveUser } from "@/lib/auth/user";
import { readInterviewPersistenceMode } from "@/lib/config/internalBeta";
import {
  createInterviewSession,
  InterviewPersistenceError
} from "@/lib/persistence/interviewSessions";
import { persistenceErrorResponse } from "@/lib/persistence/http";
import { observeRoute } from "@/lib/observability/route";
import { okResponse, validateSetupPayload } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handlePost(request: Request) {
  try {
    if (readInterviewPersistenceMode() === "off") {
      throw new InterviewPersistenceError("PERSISTENCE_DISABLED", 503, true);
    }
    const profile = await requireActiveUser(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const idempotencyKey = payload.idempotencyKey;
    if (
      !validateSetupPayload(payload) ||
      typeof idempotencyKey !== "string"
    ) {
      throw new InterviewPersistenceError("INPUT_INVALID", 400);
    }
    const session = await createInterviewSession({
      userId: profile.userId,
      resumeText: payload.resumeText,
      jdText: payload.jdText,
      interviewerStyleId: payload.interviewerStyleId,
      idempotencyKey
    });
    return NextResponse.json(okResponse(session), { status: 201 });
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    { route: "/api/interview-sessions", critical: true },
    () => handlePost(request)
  );
}
