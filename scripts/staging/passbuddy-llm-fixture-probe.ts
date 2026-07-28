import { demoScenario } from "../../lib/demo/scenario";

type ProbeResponse = {
  ok?: boolean;
  requestId?: unknown;
  error?: { code?: unknown } | null;
  meta?: {
    generation?: {
      source?: unknown;
      provider?: unknown;
      model?: unknown;
      latencyMs?: unknown;
      attempts?: unknown;
      inputTokens?: unknown;
      outputTokens?: unknown;
      requestId?: unknown;
    };
  };
};

function safeString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function main() {
  const baseUrl = (
    process.env.PASSBUDDY_PROBE_BASE_URL || "http://127.0.0.1:3001"
  ).replace(/\/$/, "");
  const requestId = `drill-${crypto.randomUUID()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${baseUrl}/api/profile/parse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId
      },
      body: JSON.stringify({
        resumeText: demoScenario.resumeText,
        jdText: demoScenario.jdText,
        interviewerStyleId: demoScenario.defaultInterviewerStyleId
      }),
      signal: controller.signal
    });
    const payload = (await response.json()) as ProbeResponse;
    const measurement = payload.meta?.generation;
    const responseRequestId = safeString(payload.requestId);
    const measurementRequestId = safeString(measurement?.requestId);
    const inputTokens = safeNumber(measurement?.inputTokens);
    const outputTokens = safeNumber(measurement?.outputTokens);

    console.log(
      JSON.stringify({
        httpStatus: response.status,
        ok: payload.ok === true,
        errorCode: safeString(payload.error?.code),
        source: safeString(measurement?.source),
        provider: safeString(measurement?.provider),
        model: safeString(measurement?.model),
        latencyMs: safeNumber(measurement?.latencyMs),
        attempts: safeNumber(measurement?.attempts),
        inputTokens,
        outputTokens,
        providerUsageReturned: inputTokens !== null || outputTokens !== null,
        requestId: responseRequestId,
        requestIdMatches:
          responseRequestId === requestId && measurementRequestId === requestId
      })
    );

    if (
      !response.ok ||
      payload.ok !== true ||
      safeNumber(measurement?.attempts) !== 1 ||
      !responseRequestId ||
      !measurementRequestId
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        httpStatus: null,
        ok: false,
        errorCode:
          error instanceof Error && error.name === "AbortError"
            ? "PROBE_TIMEOUT"
            : "PROBE_FAILED",
        source: null,
        provider: null,
        model: null,
        latencyMs: null,
        attempts: null,
        inputTokens: null,
        outputTokens: null,
        providerUsageReturned: false,
        requestId: null,
        requestIdMatches: false
      })
    );
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
}

void main();
