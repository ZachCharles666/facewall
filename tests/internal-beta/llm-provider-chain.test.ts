import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  generateJsonWithRetry,
  getLlmProviderChainDescriptors
} from "../../lib/ai/provider";

const ENV_KEYS = [
  "TOKENHUB_API_KEY",
  "TOKENHUB_BASE_URL",
  "TOKENHUB_HY3_MODEL",
  "TOKENHUB_DEEPSEEK_MODEL",
  "TOKENHUB_KIMI_MODEL",
  "NVIDIA_API_KEY",
  "NVIDIA_BASE_URL",
  "NVIDIA_MODEL",
  "OPENAI_API_KEY",
  "LLM_API_KEY"
] as const;

function jsonResponse(status = 200) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 }
    }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

function saveEnvironment() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(saved: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("TokenHub chain falls through safely to independent NVIDIA", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = saveEnvironment();
  const calls: Array<{ authorization: string | null; model: string }> = [];
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.TOKENHUB_API_KEY = "tokenhub-test-key";
    process.env.TOKENHUB_BASE_URL = "https://tokenhub.test/v1";
    process.env.NVIDIA_API_KEY = "nvidia-test-key";
    process.env.NVIDIA_BASE_URL = "https://nvidia.test/v1";

    assert.deepEqual(getLlmProviderChainDescriptors(), [
      { provider: "tokenhub.test", model: "hy3" },
      { provider: "tokenhub.test", model: "deepseek-v4-flash" },
      { provider: "tokenhub.test", model: "kimi-k3" },
      { provider: "nvidia.test", model: "meta/llama-3.1-8b-instruct" }
    ]);

    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      calls.push({
        authorization: new Headers(init?.headers).get("authorization"),
        model: body.model
      });
      return calls.length < 4 ? jsonResponse(529) : jsonResponse();
    };

    const result = await generateJsonWithRetry([
      { role: "user", content: "return JSON" }
    ]);
    assert.equal(result.provider, "nvidia.test");
    assert.equal(result.attempts, 4);
    assert.deepEqual(calls.map((call) => call.model), [
      "hy3",
      "deepseek-v4-flash",
      "kimi-k3",
      "meta/llama-3.1-8b-instruct"
    ]);
    assert.deepEqual(calls.map((call) => call.authorization), [
      "Bearer tokenhub-test-key",
      "Bearer tokenhub-test-key",
      "Bearer tokenhub-test-key",
      "Bearer nvidia-test-key"
    ]);

    calls.length = 0;
    globalThis.fetch = async () => {
      calls.push({ authorization: null, model: "hy3" });
      return jsonResponse(400);
    };
    await assert.rejects(
      generateJsonWithRetry([{ role: "user", content: "invalid" }]),
      /status 400/
    );
    assert.equal(calls.length, 1, "4xx errors must not fan out");

    calls.length = 0;
    globalThis.fetch = async () => {
      calls.push({ authorization: null, model: "hy3" });
      return jsonResponse(529);
    };
    await assert.rejects(
      generateJsonWithRetry([{ role: "user", content: "guard" }], {
        maxAttempts: 1
      }),
      /status 529/
    );
    assert.equal(calls.length, 1, "attempt guard must stay single-shot");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(originalEnv);
  }
});

test("NVIDIA remains usable as a standalone provider", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = saveEnvironment();
  let calls = 0;
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.NVIDIA_API_KEY = "nvidia-only-key";
    process.env.NVIDIA_BASE_URL = "https://nvidia-only.test/v1";
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer nvidia-only-key"
      );
      return calls === 1 ? jsonResponse(503) : jsonResponse();
    };

    const result = await generateJsonWithRetry([
      { role: "user", content: "return JSON" }
    ]);
    assert.equal(result.provider, "nvidia-only.test");
    assert.equal(result.attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(originalEnv);
  }
});

test("NVIDIA receives a bounded longer attempt window for report-sized JSON", async () => {
  const provider = await readFile("lib/ai/provider.ts", "utf8");
  assert.match(provider, /NVIDIA_PROVIDER_ATTEMPT_TIMEOUT_MS = 25_000/);
  assert.match(provider, /provider === "integrate\.api\.nvidia\.com"/);
});
