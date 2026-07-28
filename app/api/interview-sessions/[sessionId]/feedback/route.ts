import { NextResponse } from "next/server";

import { requireActiveUser } from "@/lib/auth/user";
import { shouldInjectDevFault } from "@/lib/dev/ops";
import {
  getSessionFeedback,
  submitSessionFeedback
} from "@/lib/feedback/feedback";
import { feedbackErrorResponse } from "@/lib/feedback/http";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handleGet(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const profile = await requireActiveUser(request);
    const { sessionId } = await context.params;
    return NextResponse.json(
      okResponse(await getSessionFeedback(profile.userId, sessionId))
    );
  } catch (error) {
    return feedbackErrorResponse(error);
  }
}

async function handlePost(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const profile = await requireActiveUser(request);
    const { sessionId } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(
      okResponse(
        await submitSessionFeedback({
          userId: profile.userId,
          schoolId: profile.schoolId,
          sessionId,
          rating: payload.rating,
          comment: payload.comment,
          idempotencyKey: payload.idempotencyKey,
          databaseFault: shouldInjectDevFault(request, "database")
        })
      ),
      { status: 201 }
    );
  } catch (error) {
    return feedbackErrorResponse(error);
  }
}

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, context: RouteContext) {
  return observeRoute(
    request,
    {
      route: "/api/interview-sessions/:sessionId/feedback",
      writeSecurity: {
        body: "json",
        maxBodyBytes: 4096,
        limit: 20,
        windowSeconds: 60
      }
    },
    () => handleGet(request, context)
  );
}

export async function POST(request: Request, context: RouteContext) {
  return observeRoute(
    request,
    { route: "/api/interview-sessions/:sessionId/feedback" },
    () => handlePost(request, context)
  );
}
