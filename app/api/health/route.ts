import { NextResponse } from "next/server";

import { getRuntimePool } from "@/lib/db/pool";
import { structuredLog } from "@/lib/observability/logger";
import { observeRoute } from "@/lib/observability/route";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "cache-control": "no-store, max-age=0"
};

async function handleGet() {
  try {
    await getRuntimePool().query("select 1");
    return NextResponse.json(
      {
        status: "ready",
        checks: {
          application: "up",
          database: "up"
        }
      },
      { headers: noStoreHeaders }
    );
  } catch {
    structuredLog("error", "health.readiness.failed", {
      dependency: "database"
    });
    return NextResponse.json(
      {
        status: "unavailable",
        checks: {
          application: "up",
          database: "down"
        }
      },
      {
        status: 503,
        headers: noStoreHeaders
      }
    );
  }
}

export async function GET(request: Request) {
  return observeRoute(
    request,
    {
      route: "/api/health",
      persistMetric: false,
      critical: true
    },
    handleGet
  );
}
