import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { adminErrorResponse } from "@/lib/auth/adminResponse";
import {
  createSchool,
  listSchools
} from "@/lib/admin/operations";
import { recordAdminAuditFailure } from "@/lib/admin/audit";
import { getCurrentRequestId } from "@/lib/observability/context";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handleGet(request: Request) {
  try {
    await requireAdmin(request);
    return NextResponse.json(okResponse(await listSchools()));
  } catch (error) {
    return adminErrorResponse(error);
  }
}

async function handlePost(request: Request) {
  let adminUserId: string | null = null;
  try {
    const admin = await requireAdmin(request);
    adminUserId = admin.userId;
    const payload = (await request.json()) as Record<string, unknown>;
    if (
      typeof payload.code !== "string" ||
      !/^[a-z0-9-]{2,40}$/.test(payload.code) ||
      typeof payload.name !== "string" ||
      payload.name.trim().length < 2 ||
      payload.name.trim().length > 100 ||
      !Array.isArray(payload.emailDomains) ||
      !payload.emailDomains.every(
        (domain) =>
          typeof domain === "string" &&
          /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) &&
          domain.length <= 255
      )
    ) {
      throw new Error("INPUT_INVALID");
    }
    return NextResponse.json(
      okResponse(
        await createSchool({
          adminUserId: admin.userId,
          requestId: getCurrentRequestId()!,
          code: payload.code,
          name: payload.name.trim(),
          emailDomains: payload.emailDomains.map((domain) =>
            String(domain).toLowerCase()
          )
        })
      ),
      { status: 201 }
    );
  } catch (error) {
    if (adminUserId) {
      await recordAdminAuditFailure({
        adminUserId,
        requestId: getCurrentRequestId()!,
        action: "school.create",
        targetType: "school",
        metadata: { errorCode: error instanceof Error ? error.name : "unknown" }
      });
    }
    return adminErrorResponse(error);
  }
}

export async function GET(request: Request) {
  return observeRoute(request, { route: "/api/admin/schools" }, () =>
    handleGet(request)
  );
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    {
      route: "/api/admin/schools",
      critical: true,
      writeSecurity: {
        body: "json",
        maxBodyBytes: 8192,
        limit: 60,
        windowSeconds: 60
      }
    },
    () => handlePost(request)
  );
}
