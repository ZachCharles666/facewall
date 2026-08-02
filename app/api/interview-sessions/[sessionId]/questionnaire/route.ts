import { NextResponse } from "next/server";

import { requireActiveUser } from "@/lib/auth/user";
import { shouldInjectDevFault } from "@/lib/dev/ops";
import { observeRoute } from "@/lib/observability/route";
import { questionnaireErrorResponse } from "@/lib/questionnaire/http";
import {
  getSessionQuestionnaire,
  submitSessionQuestionnaire
} from "@/lib/questionnaire/responses";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ sessionId: string }> };

async function handleGet(request: Request, context: RouteContext) {
  try {
    const profile = await requireActiveUser(request);
    const { sessionId } = await context.params;
    return NextResponse.json(
      okResponse(await getSessionQuestionnaire(profile.userId, sessionId))
    );
  } catch (error) {
    return questionnaireErrorResponse(error);
  }
}

async function handlePost(request: Request, context: RouteContext) {
  try {
    const profile = await requireActiveUser(request);
    const { sessionId } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(
      okResponse(
        await submitSessionQuestionnaire({
          userId: profile.userId,
          schoolId: profile.schoolId,
          sessionId,
          questionnaireVersion: payload.questionnaireVersion,
          answers: payload.answers,
          idempotencyKey: payload.idempotencyKey,
          databaseFault: shouldInjectDevFault(request, "database")
        })
      ),
      { status: 201 }
    );
  } catch (error) {
    return questionnaireErrorResponse(error);
  }
}

export async function GET(request: Request, context: RouteContext) {
  return observeRoute(
    request,
    { route: "/api/interview-sessions/:sessionId/questionnaire" },
    () => handleGet(request, context)
  );
}

export async function POST(request: Request, context: RouteContext) {
  return observeRoute(
    request,
    {
      route: "/api/interview-sessions/:sessionId/questionnaire",
      writeSecurity: {
        body: "json",
        maxBodyBytes: 16384,
        limit: 10,
        windowSeconds: 60
      }
    },
    () => handlePost(request, context)
  );
}

