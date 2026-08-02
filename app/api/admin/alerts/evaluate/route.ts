import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { adminErrorResponse } from "@/lib/auth/adminResponse";
import { evaluateAndDispatchAlerts } from "@/lib/observability/alerts";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handlePost(request: Request) {
  try {
    await requireAdmin(request);
    const payload = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const windowMinutes =
      payload.windowMinutes === undefined ? 5 : Number(payload.windowMinutes);
    return NextResponse.json(
      okResponse(await evaluateAndDispatchAlerts(windowMinutes))
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    {
      route: "/api/admin/alerts/evaluate",
      critical: true,
      writeSecurity: {
        body: "optional-json",
        maxBodyBytes: 4096,
        limit: 60,
        windowSeconds: 60
      }
    },
    () => handlePost(request)
  );
}
