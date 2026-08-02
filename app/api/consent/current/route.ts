import { NextResponse } from "next/server";

import { getCurrentConsent } from "@/lib/privacy/consent";
import { getOptionalPrivacyUser } from "@/lib/privacy/auth";
import { privacyErrorResponse } from "@/lib/privacy/http";
import { CURRENT_PRIVACY_POLICY } from "@/lib/privacy/policy";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handleGet(request: Request) {
  try {
    const profile = await getOptionalPrivacyUser(request);
    const current =
      profile?.status === "active"
        ? await getCurrentConsent(profile.userId)
        : {
            policyVersion: CURRENT_PRIVACY_POLICY.version,
            title: CURRENT_PRIVACY_POLICY.title,
            content: CURRENT_PRIVACY_POLICY.content,
            scopes: [...CURRENT_PRIVACY_POLICY.scopes],
            accepted: false,
            acceptedAt: null
          };
    return NextResponse.json(okResponse(current));
  } catch (error) {
    return privacyErrorResponse(error);
  }
}

export async function GET(request: Request) {
  return observeRoute(
    request,
    { route: "/api/consent/current" },
    () => handleGet(request)
  );
}
