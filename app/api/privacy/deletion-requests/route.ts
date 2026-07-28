import { NextResponse } from "next/server";

import { requirePrivacyUser } from "@/lib/privacy/auth";
import {
  createDeletionRequest,
  getLatestDeletionRequest
} from "@/lib/privacy/deletion";
import { privacyErrorResponse } from "@/lib/privacy/http";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handleGet(request: Request) {
  try {
    const profile = await requirePrivacyUser(request, ["active", "deletion_pending"]);
    return NextResponse.json(
      okResponse(await getLatestDeletionRequest(profile.userId))
    );
  } catch (error) {
    return privacyErrorResponse(error);
  }
}

async function handlePost(request: Request) {
  try {
    const profile = await requirePrivacyUser(request, ["active", "deletion_pending"]);
    const payload = (await request.json()) as Record<string, unknown>;
    const deletionRequest = await createDeletionRequest({
      userId: profile.userId,
      idempotencyKey: payload.idempotencyKey,
      reason: payload.reason
    });
    return NextResponse.json(okResponse(deletionRequest), { status: 201 });
  } catch (error) {
    return privacyErrorResponse(error);
  }
}

export async function GET(request: Request) {
  return observeRoute(
    request,
    { route: "/api/privacy/deletion-requests", critical: true },
    () => handleGet(request)
  );
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    { route: "/api/privacy/deletion-requests", critical: true },
    () => handlePost(request)
  );
}
