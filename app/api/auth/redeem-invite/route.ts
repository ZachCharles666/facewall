import { NextResponse } from "next/server";

import { callBetterAuth } from "@/lib/auth/betterAuthHandler";
import { hashInviteCode } from "@/lib/auth/challenge";
import { consumeInviteForUser } from "@/lib/auth/profile";
import { shouldInjectDevFault } from "@/lib/dev/ops";
import {
  isInternalBetaAuthEnabled,
  isConsentGateEnabled,
  readAuthConfig
} from "@/lib/config/internalBeta";
import { errorResponse, okResponse } from "@/lib/schemas/contracts";
import { CURRENT_PRIVACY_POLICY } from "@/lib/privacy/policy";
import { observeRoute } from "@/lib/observability/route";

export const runtime = "nodejs";

async function handlePost(request: Request) {
  try {
    if (!isInternalBetaAuthEnabled()) {
      return NextResponse.json(errorResponse("AUTH_DISABLED", "内测登录暂未开放", true), {
        status: 503
      });
    }
    const authResponse = await callBetterAuth(request, "/get-session");
    const session = authResponse.ok
      ? ((await authResponse.json()) as {
          user?: { id?: string; email?: string };
        } | null)
      : null;
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json(errorResponse("AUTH_REQUIRED", "请先完成邮箱验证", false), {
        status: 401
      });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    if (typeof payload.inviteCode !== "string") throw new Error("INPUT_INVALID");
    const inviteHash = hashInviteCode(payload.inviteCode, readAuthConfig().secret);
    const profile = await consumeInviteForUser(
      inviteHash,
      session.user.id,
      session.user.email,
      { databaseFault: shouldInjectDevFault(request, "database") }
    );
    if (profile.status !== "active") {
      return NextResponse.json(errorResponse("ACCOUNT_UNAVAILABLE", "账号当前不可用", false), {
        status: 403
      });
    }
    return NextResponse.json(
      okResponse({
        user: {
          id: profile.userId,
          email: profile.email,
          schoolId: profile.schoolId,
          role: profile.role
        },
        needsInvite: false,
        needsConsent: isConsentGateEnabled(),
        policyVersion: CURRENT_PRIVACY_POLICY.version,
        sessionLimit: profile.sessionLimit,
        sessionsRemaining: Math.max(0, profile.sessionLimit - profile.sessionsStarted)
      })
    );
  } catch (error) {
    const code =
      error instanceof Error && /^INVITE_(INVALID|EXPIRED|EXHAUSTED)$/.test(error.message)
        ? error.message
        : error instanceof Error && error.message === "INPUT_INVALID"
          ? "INPUT_INVALID"
          : "PROFILE_INIT_FAILED";
    const status = code === "INVITE_EXHAUSTED" ? 409 : code === "PROFILE_INIT_FAILED" ? 500 : 400;
    return NextResponse.json(
      errorResponse(
        code,
        code === "PROFILE_INIT_FAILED" ? "内测资格激活失败，请重试" : "邀请码不可用",
        code === "PROFILE_INIT_FAILED"
      ),
      { status }
    );
  }
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    {
      route: "/api/auth/redeem-invite",
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
