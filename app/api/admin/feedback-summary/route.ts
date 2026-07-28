import { NextResponse } from "next/server";

import { requireAdmin, AdminAuthError } from "@/lib/auth/admin";
import { adminErrorResponse } from "@/lib/auth/adminResponse";
import { getAdminPool } from "@/lib/db/pool";
import { observeRoute } from "@/lib/observability/route";
import { okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handleGet(request: Request) {
  try {
    await requireAdmin(request);
    const result = await getAdminPool().query(
      `select count(*)::int as count,
              coalesce(round(avg(rating)::numeric, 2), 0) as average_rating,
              count(*) filter (where rating = 1)::int as rating_1,
              count(*) filter (where rating = 2)::int as rating_2,
              count(*) filter (where rating = 3)::int as rating_3,
              count(*) filter (where rating = 4)::int as rating_4,
              count(*) filter (where rating = 5)::int as rating_5
         from public.feedback`
    );
    const row = result.rows[0];
    return NextResponse.json(
      okResponse({
        count: row.count,
        averageRating: Number(row.average_rating),
        ratings: {
          1: row.rating_1,
          2: row.rating_2,
          3: row.rating_3,
          4: row.rating_4,
          5: row.rating_5
        }
      })
    );
  } catch (error) {
    return error instanceof AdminAuthError
      ? adminErrorResponse(error)
      : NextResponse.json(
          {
            ok: false,
            data: null,
            error: { code: "ADMIN_QUERY_FAILED", message: "聚合查询失败", retryable: true },
            requestId: crypto.randomUUID()
          },
          { status: 500 }
        );
  }
}

export async function GET(request: Request) {
  return observeRoute(request, { route: "/api/admin/feedback-summary" }, () =>
    handleGet(request)
  );
}
