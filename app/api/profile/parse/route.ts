import { NextResponse } from "next/server";
import { generateJsonWithRetry, isLlmConfigured, createTimeoutSignal, getLlmErrorCode, getLlmProviderDescriptor } from "@/lib/ai/provider";
import { fallbackMeasurement, llmMeasurement } from "@/lib/ai/measurement";
import { shouldForceDemoFallback, shouldInjectDevFault } from "@/lib/dev/ops";
import { demoScenario } from "@/lib/demo/scenario";
import { buildProfilePrompt } from "@/lib/prompts/interview";
import { resolvePromptOverrides } from "@/lib/prompts/promptStore";
import { errorResponse, okResponse, validateProfileOutput, validateSetupPayload } from "@/lib/schemas/contracts";
import { structuredLog } from "@/lib/observability/logger";
import { observeRoute } from "@/lib/observability/route";
import type { CandidateProfile } from "@/lib/types";

function getSafeLlmRuntimeInfo() {
  const descriptor = getLlmProviderDescriptor();
  return { host: descriptor.provider, model: descriptor.model };
}

function logProfileMode(mode: string, extra?: Record<string, string | number | boolean | null>) {
  structuredLog("info", "profile.generate", { mode, ...extra });
}

async function handlePost(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(errorResponse<CandidateProfile>("INPUT_INVALID", "请求体不是合法 JSON", false), { status: 400 });
  }

  if (!validateSetupPayload(payload)) {
    return NextResponse.json(
      errorResponse<CandidateProfile>("INPUT_INVALID", "请补充至少 20 字的简历和 JD，并选择面试官风格", false),
      { status: 400 }
    );
  }

  if (shouldInjectDevFault(request, "llm")) {
    logProfileMode("llm_fault_injected");
    return NextResponse.json(errorResponse<CandidateProfile>("LLM_PROVIDER_FAILED", "开发故障注入：画像生成失败。", true), {
      status: 502
    });
  }

  if (shouldForceDemoFallback(request)) {
    logProfileMode("forced_demo_fallback");
    return NextResponse.json(
      okResponse(demoScenario.candidateProfile, {
        generation: fallbackMeasurement()
      })
    );
  }

  if (!isLlmConfigured()) {
    logProfileMode("no_llm_configured_demo_fallback");
    return NextResponse.json(
      okResponse(demoScenario.candidateProfile, {
        generation: fallbackMeasurement()
      })
    );
  }

  const timeout = createTimeoutSignal(35_000, request.signal);
  try {
    logProfileMode("llm_request", getSafeLlmRuntimeInfo());
    const promptOverrides = await resolvePromptOverrides(payload);
    const result = await generateJsonWithRetry(buildProfilePrompt(payload, promptOverrides), {
      signal: timeout.signal,
      maxAttempts: process.env.PASSBUDDY_LLM_MAX_ATTEMPTS === "1" ? 1 : 2
    });
    const profile = validateProfileOutput(result.json);
    logProfileMode("llm_success", {
      sourceMatches: profile.sourceMatches.length,
      matchedPoints: profile.matchedPoints.length,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens
    });
    return NextResponse.json(
      okResponse(profile, { generation: llmMeasurement(result) })
    );
  } catch (error) {
    const code = getLlmErrorCode(error);
    logProfileMode("llm_failed", { code });
    const message =
      code === "LLM_SCHEMA_INVALID"
        ? "画像生成结果结构不符合契约，请重试或使用演示兜底。"
        : "画像生成失败，请重试或使用演示兜底。";
    return NextResponse.json(errorResponse<CandidateProfile>(code, message, true), { status: 502 });
  } finally {
    timeout.clear();
  }
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    { route: "/api/profile/parse", critical: true },
    () => handlePost(request)
  );
}
