import { NextResponse } from "next/server";

import { requireActiveUser } from "@/lib/auth/user";
import { getCurrentInterviewSession } from "@/lib/persistence/interviewSessions";
import { persistenceErrorResponse } from "@/lib/persistence/http";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handleGet(request: Request) {
  try {
    const profile = await requireActiveUser(request);
    return NextResponse.json(
      okResponse(await getCurrentInterviewSession(profile.userId))
    );
  } catch (error) {
    return persistenceErrorResponse(error);
  }
}

export async function GET(request: Request) {
  return observeRoute(
    request,
    { route: "/api/interview-sessions/current", critical: true },
    () => handleGet(request)
  );
}
