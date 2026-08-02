import { NextResponse } from "next/server";
import { generateJsonWithRetry, isLlmConfigured, createTimeoutSignal, getLlmErrorCode } from "@/lib/ai/provider";
import { fallbackMeasurement, llmMeasurement } from "@/lib/ai/measurement";
import { shouldForceDemoFallback, shouldInjectDevFault } from "@/lib/dev/ops";
import { buildFallbackQuestions } from "@/lib/demo/fallback";
import { buildQuestionsPrompt } from "@/lib/prompts/interview";
import { resolvePromptOverrides } from "@/lib/prompts/promptStore";
import { errorResponse, okResponse, validateQuestionRequest, validateQuestionsOutput } from "@/lib/schemas/contracts";
import { structuredLog } from "@/lib/observability/logger";
import { observeRoute } from "@/lib/observability/route";
import type { InterviewQuestion } from "@/lib/types";

async function handlePost(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(errorResponse<{ questions: InterviewQuestion[] }>("INPUT_INVALID", "请求体不是合法 JSON", false), {
      status: 400
    });
  }

  if (!validateQuestionRequest(payload)) {
    return NextResponse.json(
      errorResponse<{ questions: InterviewQuestion[] }>("INPUT_INVALID", "题目生成参数不符合契约", false),
      { status: 400 }
    );
  }

  if (shouldInjectDevFault(request, "llm")) {
    return NextResponse.json(
      errorResponse<{ questions: InterviewQuestion[] }>("LLM_PROVIDER_FAILED", "开发故障注入：题目生成失败。", true),
      { status: 502 }
    );
  }

  if (shouldForceDemoFallback(request)) {
    return NextResponse.json(
      okResponse(
        { questions: buildFallbackQuestions(payload.interviewerStyleId) },
        { generation: fallbackMeasurement() }
      )
    );
  }

  if (!isLlmConfigured()) {
    return NextResponse.json(
      okResponse(
        { questions: buildFallbackQuestions(payload.interviewerStyleId) },
        { generation: fallbackMeasurement() }
      )
    );
  }

  const timeout = createTimeoutSignal(35_000, request.signal);
  try {
    const promptOverrides = await resolvePromptOverrides(payload);
    const result = await generateJsonWithRetry(buildQuestionsPrompt(payload, promptOverrides), { signal: timeout.signal });
    const data = validateQuestionsOutput(result.json);
    structuredLog("info", "questions.generate.completed", {
      latencyMs: result.latencyMs,
      attempts: result.attempts,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens
    });
    return NextResponse.json(
      okResponse(data, { generation: llmMeasurement(result) })
    );
  } catch (error) {
    const code = getLlmErrorCode(error);
    const message =
      code === "LLM_SCHEMA_INVALID" ? "题目生成结果结构不符合契约，请重试或使用演示题目。" : "题目生成失败，请重试或使用演示题目。";
    return NextResponse.json(errorResponse<{ questions: InterviewQuestion[] }>(code, message, true), {
      status: 502
    });
  } finally {
    timeout.clear();
  }
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    { route: "/api/questions/generate", critical: true },
    () => handlePost(request)
  );
}
