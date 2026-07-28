import { NextResponse } from "next/server";

import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { adminErrorResponse } from "@/lib/auth/adminResponse";
import { listDeletionRequests } from "@/lib/privacy/deletion";
import { privacyErrorResponse } from "@/lib/privacy/http";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handleGet(request: Request) {
  try {
    await requireAdmin(request);
    return NextResponse.json(okResponse(await listDeletionRequests()));
  } catch (error) {
    return error instanceof AdminAuthError
      ? adminErrorResponse(error)
      : privacyErrorResponse(error);
  }
}

export async function GET(request: Request) {
  return observeRoute(request, { route: "/api/admin/deletion-requests" }, () =>
    handleGet(request)
  );
}
