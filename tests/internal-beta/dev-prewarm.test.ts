import assert from "node:assert/strict";
import test from "node:test";

import { shouldInjectDevFault } from "../../lib/dev/ops";
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
      "/api/report/generate",
      "/api/azure-status",
      "/api/tts"
    ]
  );
  assert.ok(requests.every(({ init }) => init?.method === "OPTIONS"));
});

test("development speech fault headers isolate TTS from STT", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "development" });
  try {
    const ttsRequest = new Request("http://localhost/api/tts", {
      headers: { "x-facewall-fault": "tts" }
    });
    const sttRequest = new Request("http://localhost/api/stt", {
      headers: { "x-facewall-fault": "stt" }
    });

    assert.equal(shouldInjectDevFault(ttsRequest, "tts"), true);
    assert.equal(shouldInjectDevFault(ttsRequest, "stt"), false);
    assert.equal(shouldInjectDevFault(sttRequest, "stt"), true);
    assert.equal(shouldInjectDevFault(sttRequest, "tts"), false);
  } finally {
    if (previousNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    }
  }
});
