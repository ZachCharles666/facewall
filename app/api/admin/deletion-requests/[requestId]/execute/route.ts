import { NextResponse } from "next/server";

import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { adminErrorResponse } from "@/lib/auth/adminResponse";
import { executeDeletionRequest } from "@/lib/privacy/deletion";
import { privacyErrorResponse } from "@/lib/privacy/http";
import { getCurrentRequestId } from "@/lib/observability/context";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handlePost(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const admin = await requireAdmin(request);
    const { requestId } = await context.params;
    return NextResponse.json(
      okResponse(
        await executeDeletionRequest({
          requestId,
          adminUserId: admin.userId,
          auditRequestId: getCurrentRequestId()
        })
      )
    );
  } catch (error) {
    return error instanceof AdminAuthError
      ? adminErrorResponse(error)
      : privacyErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  return observeRoute(
    request,
    {
      route: "/api/admin/deletion-requests/:requestId/execute",
      critical: true,
      writeSecurity: {
        body: "none",
        limit: 30,
        windowSeconds: 60
      }
    },
    () => handlePost(request, context)
  );
}
