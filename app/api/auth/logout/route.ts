import { NextResponse } from "next/server";

import { callBetterAuth, withAuthCookie } from "@/lib/auth/betterAuthHandler";
import { isInternalBetaAuthEnabled } from "@/lib/config/internalBeta";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handlePost(request: Request) {
  if (!isInternalBetaAuthEnabled()) {
    return NextResponse.json(okResponse({ success: true }));
  }
  const authResponse = await callBetterAuth(request, "/sign-out", {});
  return withAuthCookie(NextResponse.json(okResponse({ success: true })), authResponse);
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    {
      route: "/api/auth/logout",
      writeSecurity: {
        body: "none",
        limit: 30,
        windowSeconds: 60
      }
    },
    () => handlePost(request)
  );
}
