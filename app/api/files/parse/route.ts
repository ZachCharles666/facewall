import { observeRoute } from "@/lib/observability/route";
import { handleFileParsePost } from "@/app/api/files/parse/handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return observeRoute(request, { route: "/api/files/parse" }, () =>
    handleFileParsePost(request)
  );
}
