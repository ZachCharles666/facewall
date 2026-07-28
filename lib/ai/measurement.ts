import type {
  GenerationMeasurement,
  GenerationSource
} from "@/lib/types";
import type { LlmJsonResult } from "@/lib/ai/provider";
import { getCurrentRequestId } from "@/lib/observability/context";

export function llmMeasurement(
  result: LlmJsonResult
): GenerationMeasurement {
  return {
    source: "llm",
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    attempts: result.attempts,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    requestId: getCurrentRequestId() ?? null
  };
}

export function fallbackMeasurement(
  source: Extract<GenerationSource, "demo_fallback" | "mixed"> = "demo_fallback"
): GenerationMeasurement {
  return {
    source,
    provider: source === "demo_fallback" ? "local_demo" : null,
    model: null,
    latencyMs: null,
    attempts: null,
    inputTokens: null,
    outputTokens: null,
    requestId: getCurrentRequestId() ?? null
  };
}
