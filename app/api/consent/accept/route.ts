import { NextResponse } from "next/server";

import { requirePrivacyUser } from "@/lib/privacy/auth";
import { acceptCurrentConsent } from "@/lib/privacy/consent";
import { privacyErrorResponse } from "@/lib/privacy/http";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handlePost(request: Request) {
  try {
    const profile = await requirePrivacyUser(request);
    const payload = (await request.json()) as Record<string, unknown>;
    const consent = await acceptCurrentConsent({
      userId: profile.userId,
      policyVersion: payload.policyVersion,
      scopes: payload.scopes,
      idempotencyKey: payload.idempotencyKey
    });
    return NextResponse.json(okResponse(consent));
  } catch (error) {
    return privacyErrorResponse(error);
  }
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    { route: "/api/consent/accept" },
    () => handlePost(request)
  );
}
