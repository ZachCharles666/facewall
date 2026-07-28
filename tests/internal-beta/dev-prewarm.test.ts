import assert from "node:assert/strict";
import test from "node:test";

import { prewarmDevRoutes } from "../../lib/dev/prewarm";

test("development route prewarm compiles the main transition APIs without executing them", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  prewarmDevRoutes(fetcher);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(
    requests.map(({ url }) => url),
    [
      "/api/profile/parse",
      "/api/questions/generate",
      "/api/report/generate-stream",
      "/api/report/generate"
    ]
  );
  assert.ok(requests.every(({ init }) => init?.method === "OPTIONS"));
});
