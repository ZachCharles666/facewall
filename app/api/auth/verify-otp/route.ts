import { NextResponse } from "next/server";

import { callBetterAuth, withAuthCookie } from "@/lib/auth/betterAuthHandler";
import { normalizeEmail, readAuthChallenge } from "@/lib/auth/challenge";
import {
  getAuthProfile,
  revokeAuthSession
} from "@/lib/auth/profile";
import { isInternalBetaAuthEnabled, readAuthConfig } from "@/lib/config/internalBeta";
import { errorResponse, okResponse } from "@/lib/schemas/contracts";
import { getCurrentConsent } from "@/lib/privacy/consent";
import { CURRENT_PRIVACY_POLICY } from "@/lib/privacy/policy";
import { isConsentGateEnabled } from "@/lib/config/internalBeta";
import { observeRoute } from "@/lib/observability/route";

export const runtime = "nodejs";

interface BetterAuthSignIn {
  token: string;
  user: { id: string; email: string };
}

async function handlePost(request: Request) {
  try {
    if (!isInternalBetaAuthEnabled()) {
      return NextResponse.json(errorResponse("AUTH_DISABLED", "内测登录暂未开放", true), {
        status: 503
      });
    }
    const payload = (await request.json()) as Record<string, unknown>;
    if (
      typeof payload.email !== "string" ||
      typeof payload.token !== "string" ||
      !/^\d{6}$/.test(payload.token) ||
      typeof payload.challengeId !== "string"
    ) {
      throw new Error("INPUT_INVALID");
    }

    const { secret } = readAuthConfig();
    const email = normalizeEmail(payload.email);
    readAuthChallenge(payload.challengeId, email, secret);
    const authResponse = await callBetterAuth(request, "/sign-in/email-otp", {
      email,
      otp: payload.token
    });
    if (!authResponse.ok) {
      return NextResponse.json(
        errorResponse("OTP_INVALID_OR_EXPIRED", "验证码错误或已过期", true),
        { status: 400 }
      );
    }

    const signIn = (await authResponse.json()) as BetterAuthSignIn;
    try {
      const profile = await getAuthProfile(signIn.user.id);
      if (profile && !["active", "deletion_pending"].includes(profile.status)) {
        await revokeAuthSession(signIn.token).catch(() => undefined);
        return NextResponse.json(
          errorResponse("ACCOUNT_UNAVAILABLE", "账号当前不可用", false),
          { status: 403 }
        );
      }
      const privacyOnly = profile?.status === "deletion_pending";
      const consentAccepted =
        !profile || privacyOnly || !isConsentGateEnabled()
          ? true
          : (await getCurrentConsent(profile.userId)).accepted;
      const response = NextResponse.json(
        okResponse({
          user: profile
            ? {
                id: profile.userId,
                email: profile.email,
                schoolId: profile.schoolId,
                role: profile.role
              }
            : {
                id: signIn.user.id,
                email: signIn.user.email
              },
          needsInvite: !profile,
          needsConsent: Boolean(profile) && !privacyOnly && !consentAccepted,
          privacyOnly,
          policyVersion: CURRENT_PRIVACY_POLICY.version
        })
      );
      return withAuthCookie(response, authResponse);
    } catch {
      await revokeAuthSession(signIn.token).catch(() => undefined);
      return NextResponse.json(
        errorResponse("AUTH_SERVICE_UNAVAILABLE", "登录服务暂时不可用，请重试", true),
        { status: 503 }
      );
    }
  } catch {
    return NextResponse.json(
      errorResponse("OTP_INVALID_OR_EXPIRED", "验证码错误或已过期", true),
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    {
      route: "/api/auth/verify-otp",
      critical: true,
      writeSecurity: {
        body: "json",
        maxBodyBytes: 4096,
        limit: 10,
        windowSeconds: 60
      }
    },
    () => handlePost(request)
  );
}
