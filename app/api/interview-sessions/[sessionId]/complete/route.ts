import { NextResponse } from "next/server";

import { requireActiveUser } from "@/lib/auth/user";
import {
  completeInterviewSession,
  InterviewPersistenceError
} from "@/lib/persistence/interviewSessions";
import { persistenceErrorResponse } from "@/lib/persistence/http";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ sessionId: string }> };

async function handlePost(request: Request, context: RouteContext) {
  try {
    const profile = await requireActiveUser(request);
    const { sessionId } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    if (
      !Number.isInteger(payload.expectedVersion) ||
      typeof payload.idempotencyKey !== "string"
    ) {
      throw new InterviewPersistenceError("INPUT_INVALID", 400);
    }
    const snapshot = await completeInterviewSession({
      userId: profile.userId,
      sessionId,
      expectedVersion: Number(payload.expectedVersion),
      idempotencyKey: payload.idempotencyKey
    });
    return NextResponse.json(okResponse(snapshot));
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  return observeRoute(
    request,
    { route: "/api/interview-sessions/:sessionId/complete", critical: true },
    () => handlePost(request, context)
  );
}
