import { NextResponse } from "next/server";
import { generateJsonWithRetry, isLlmConfigured, createTimeoutSignal, getLlmErrorCode } from "@/lib/ai/provider";
import { shouldForceDemoFallback, shouldInjectDevFault } from "@/lib/dev/ops";
import { demoScenario } from "@/lib/demo/scenario";
import { buildProfilePrompt } from "@/lib/prompts/interview";
import { errorResponse, okResponse, validateProfileOutput, validateSetupPayload } from "@/lib/schemas/contracts";
import type { CandidateProfile } from "@/lib/types";

export async function POST(request: Request) {
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
    return NextResponse.json(errorResponse<CandidateProfile>("LLM_PROVIDER_FAILED", "开发故障注入：画像生成失败。", true), {
      status: 502
    });
  }

  if (shouldForceDemoFallback(request)) {
    return NextResponse.json(okResponse(demoScenario.candidateProfile));
  }

  if (!isLlmConfigured()) {
    return NextResponse.json(okResponse(demoScenario.candidateProfile));
  }

  const timeout = createTimeoutSignal();
  try {
    const result = await generateJsonWithRetry(buildProfilePrompt(payload), { signal: timeout.signal });
    const profile = validateProfileOutput(result.json);
    return NextResponse.json(okResponse(profile));
  } catch (error) {
    const code = getLlmErrorCode(error);
    const message =
      code === "LLM_SCHEMA_INVALID"
        ? "画像生成结果结构不符合契约，请重试或使用演示兜底。"
        : "画像生成失败，请重试或使用演示兜底。";
    return NextResponse.json(errorResponse<CandidateProfile>(code, message, true), { status: 502 });
  } finally {
    timeout.clear();
  }
}
