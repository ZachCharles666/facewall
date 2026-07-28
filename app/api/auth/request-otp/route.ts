import { NextResponse } from "next/server";

import { reserveOtpSendBudget } from "@/lib/auth/budget";
import { callBetterAuth } from "@/lib/auth/betterAuthHandler";
import {
  createAuthChallenge,
  hashOtpRateKey,
  normalizeEmail
} from "@/lib/auth/challenge";
import {
  readAuthConfig,
  isInternalBetaAuthEnabled,
  readOtpExpiresInSec,
  readOtpBudgetConfig
} from "@/lib/config/internalBeta";
import { observeRoute } from "@/lib/observability/route";
import { errorResponse, okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

function sourceIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

async function handlePost(request: Request) {
  try {
    if (!isInternalBetaAuthEnabled()) {
      return NextResponse.json(errorResponse("AUTH_DISABLED", "内测登录暂未开放", true), {
        status: 503
      });
    }
    if (Number(request.headers.get("content-length") || 0) > 4096) {
      return NextResponse.json(errorResponse("INPUT_INVALID", "请求内容不合法", false), {
        status: 400
      });
    }
    const payload = (await request.json()) as Record<string, unknown>;
    if (typeof payload.email !== "string") {
      throw new Error("INPUT_INVALID");
    }

    const { secret } = readAuthConfig();
    const email = normalizeEmail(payload.email);
    const budget = await reserveOtpSendBudget(
      hashOtpRateKey("email", email, secret),
      hashOtpRateKey("ip", sourceIp(request), secret),
      readOtpBudgetConfig()
    );
    if (budget.status === "email_limited" || budget.status === "ip_limited") {
      return NextResponse.json(
        errorResponse("OTP_RATE_LIMITED", "请求过于频繁，请稍后再试", true),
        { status: 429, headers: { "retry-after": "60" } }
      );
    }
    if (budget.status === "budget_exhausted") {
      return NextResponse.json(
        errorResponse("EMAIL_BUDGET_EXHAUSTED", "验证码服务繁忙，请稍后再试", true),
        { status: 503 }
      );
    }
    if (budget.status === "allowed_warn") {
      console.warn("AUTH_OTP_BUDGET_WARNING", { globalCount: budget.globalCount });
    }

    const authResponse = await callBetterAuth(
      request,
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" }
    );
    if (!authResponse.ok) {
      return NextResponse.json(
        errorResponse("EMAIL_DELIVERY_FAILED", "验证码发送失败，请稍后重试", true),
        { status: 502 }
      );
    }

    const expiresInSec = readOtpExpiresInSec();
    return NextResponse.json(
      okResponse({
        challengeId: createAuthChallenge(email, secret, Date.now(), expiresInSec),
        resendAfterSec: 60,
        expiresInSec
      })
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INPUT_INVALID") {
      return NextResponse.json(errorResponse("INPUT_INVALID", "请求内容不合法", false), {
        status: 400
      });
    }
    return NextResponse.json(
      errorResponse("AUTH_SERVICE_UNAVAILABLE", "登录服务暂时不可用，请稍后重试", true),
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    {
      route: "/api/auth/request-otp",
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
