import { NextResponse } from "next/server";

import { requireActiveUser } from "@/lib/auth/user";
import { shouldInjectDevFault } from "@/lib/dev/ops";
import {
  getInterviewSession,
  InterviewPersistenceError,
  saveSessionMilestone
} from "@/lib/persistence/interviewSessions";
import { persistenceErrorResponse } from "@/lib/persistence/http";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ sessionId: string }> };

async function handleGet(request: Request, context: RouteContext) {
  try {
    const profile = await requireActiveUser(request);
    const { sessionId } = await context.params;
    return NextResponse.json(
      okResponse(await getInterviewSession(profile.userId, sessionId))
    );
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}

async function handlePatch(request: Request, context: RouteContext) {
  try {
    const profile = await requireActiveUser(request);
    const { sessionId } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    if (
      !Number.isInteger(payload.expectedVersion) ||
      (payload.milestone !== "profile_ready" &&
        payload.milestone !== "questions_ready") ||
      typeof payload.generationSource !== "string" ||
      typeof payload.idempotencyKey !== "string"
    ) {
      throw new InterviewPersistenceError("INPUT_INVALID", 400);
    }
    const snapshot = await saveSessionMilestone({
      userId: profile.userId,
      sessionId,
      expectedVersion: Number(payload.expectedVersion),
      milestone: payload.milestone,
      candidateProfile:
        payload.milestone === "profile_ready"
          ? (payload.candidateProfile as never)
          : undefined,
      questions:
        payload.milestone === "questions_ready"
          ? (payload.questions as never)
          : undefined,
      generationSource: payload.generationSource as never,
      measurement: payload.measurement as never,
      idempotencyKey: payload.idempotencyKey,
      databaseFault: shouldInjectDevFault(request, "database")
    });
    return NextResponse.json(okResponse(snapshot));
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}

export async function GET(request: Request, context: RouteContext) {
  return observeRoute(
    request,
    { route: "/api/interview-sessions/:sessionId", critical: true },
    () => handleGet(request, context)
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  return observeRoute(
    request,
    { route: "/api/interview-sessions/:sessionId", critical: true },
    () => handlePatch(request, context)
  );
}
