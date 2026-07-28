import { NextResponse } from "next/server";

import { getAdminMetrics } from "@/lib/admin/metrics";
import { requireAdmin } from "@/lib/auth/admin";
import { adminErrorResponse } from "@/lib/auth/adminResponse";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

function parseFilter(request: Request) {
  const url = new URL(request.url);
  const to = url.searchParams.get("to")
    ? new Date(url.searchParams.get("to")!)
    : new Date();
  const from = url.searchParams.get("from")
    ? new Date(url.searchParams.get("from")!)
    : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const schoolId = url.searchParams.get("schoolId");
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from >= to ||
    to.getTime() - from.getTime() > MAX_RANGE_MS ||
    (schoolId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        schoolId
      ))
  ) {
    throw new Error("INPUT_INVALID");
  }
  return { from, to, schoolId: schoolId || null };
}

async function handleGet(request: Request) {
  try {
    await requireAdmin(request);
    return NextResponse.json(okResponse(await getAdminMetrics(parseFilter(request))));
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function GET(request: Request) {
  return observeRoute(
    request,
    { route: "/api/admin/metrics", critical: true },
    () => handleGet(request)
  );
}
