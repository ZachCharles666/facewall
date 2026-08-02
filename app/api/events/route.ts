import { NextResponse } from "next/server";

import {
  recordClientEvent,
  validateClientEvent
} from "@/lib/analytics/events";
import { requireActiveUser } from "@/lib/auth/user";
import { observeRoute } from "@/lib/observability/route";
import { errorResponse, okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handlePost(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 4096) {
      throw new Error("INPUT_INVALID");
    }
    const profile = await requireActiveUser(request);
    const payload = validateClientEvent(
      (await request.json()) as Record<string, unknown>
    );
    if (!payload) throw new Error("INPUT_INVALID");
    return NextResponse.json(
      okResponse(
        await recordClientEvent(profile.userId, profile.schoolId, payload)
      ),
      { status: 201 }
    );
  } catch (error) {
    const code =
      error instanceof Error && error.message === "RESOURCE_NOT_FOUND"
        ? "RESOURCE_NOT_FOUND"
        : error instanceof Error &&
            (error.message === "AUTH_REQUIRED" ||
              error.message === "ACCOUNT_UNAVAILABLE")
          ? error.message
          : "INPUT_INVALID";
    const status = code === "AUTH_REQUIRED" ? 401 : code === "ACCOUNT_UNAVAILABLE" ? 403 : code === "RESOURCE_NOT_FOUND" ? 404 : 400;
    return NextResponse.json(
      errorResponse(
        code,
        code === "INPUT_INVALID" ? "事件不符合 allowlist" : "资源不可用",
        false
      ),
      { status }
    );
  }
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    {
      route: "/api/events",
      writeSecurity: {
        body: "json",
        maxBodyBytes: 4096,
        limit: 120,
        windowSeconds: 60
      }
    },
    () => handlePost(request)
  );
}
