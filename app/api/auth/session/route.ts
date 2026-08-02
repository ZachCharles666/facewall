import { NextResponse } from "next/server";

import { callBetterAuth } from "@/lib/auth/betterAuthHandler";
import { getAuthProfile } from "@/lib/auth/profile";
import { isInternalBetaAuthEnabled } from "@/lib/config/internalBeta";
import { isConsentGateEnabled } from "@/lib/config/internalBeta";
import { getCurrentConsent } from "@/lib/privacy/consent";
import { CURRENT_PRIVACY_POLICY } from "@/lib/privacy/policy";
import { errorResponse, okResponse } from "@/lib/schemas/contracts";
import { observeRoute } from "@/lib/observability/route";

export const runtime = "nodejs";

async function handleGet(request: Request) {
  if (!isInternalBetaAuthEnabled()) {
    return NextResponse.json(errorResponse("AUTH_DISABLED", "内测登录暂未开放", true), {
      status: 503
    });
  }
  const authResponse = await callBetterAuth(request, "/get-session");
  if (!authResponse.ok) {
    return NextResponse.json(errorResponse("AUTH_REQUIRED", "请先登录", false), {
      status: 401
    });
  }
  const session = (await authResponse.json()) as
    | { user?: { id?: string; email?: string } }
    | null;
  if (!session?.user?.id) {
    return NextResponse.json(errorResponse("AUTH_REQUIRED", "请先登录", false), {
      status: 401
    });
  }
  const profile = await getAuthProfile(session.user.id);
  if (!profile) {
    return NextResponse.json(
      okResponse({
        user: {
          id: session.user.id,
          email: session.user.email || ""
        },
        needsInvite: true,
        needsConsent: false,
        policyVersion: CURRENT_PRIVACY_POLICY.version
      })
    );
  }
  if (!["active", "deletion_pending"].includes(profile.status)) {
    return NextResponse.json(errorResponse("ACCOUNT_UNAVAILABLE", "账号当前不可用", false), {
      status: 403
    });
  }
  const privacyOnly = profile.status === "deletion_pending";
  const consent = isConsentGateEnabled() && !privacyOnly
    ? await getCurrentConsent(profile.userId)
    : { accepted: true };
  return NextResponse.json(
    okResponse({
      user: {
        id: profile.userId,
        email: profile.email,
        schoolId: profile.schoolId,
        role: profile.role
      },
      needsInvite: false,
      needsConsent: !privacyOnly && !consent.accepted,
      privacyOnly,
      policyVersion: CURRENT_PRIVACY_POLICY.version
    })
  );
}

export async function GET(request: Request) {
  return observeRoute(
    request,
    { route: "/api/auth/session", critical: true },
    () => handleGet(request)
  );
}
