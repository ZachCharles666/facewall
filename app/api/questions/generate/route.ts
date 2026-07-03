import { NextResponse } from "next/server";
import { generateJsonWithRetry, isLlmConfigured, createTimeoutSignal, getLlmErrorCode } from "@/lib/ai/provider";
import { shouldForceDemoFallback, shouldInjectDevFault } from "@/lib/dev/ops";
import { buildFallbackQuestions } from "@/lib/demo/fallback";
import { buildQuestionsPrompt } from "@/lib/prompts/interview";
import { resolvePromptOverrides } from "@/lib/prompts/promptStore";
import { errorResponse, okResponse, validateQuestionRequest, validateQuestionsOutput } from "@/lib/schemas/contracts";
import type { InterviewQuestion } from "@/lib/types";

export async function POST(request: Request) {
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
    return NextResponse.json(okResponse({ questions: buildFallbackQuestions(payload.interviewerStyleId) }));
  }

  if (!isLlmConfigured()) {
    return NextResponse.json(okResponse({ questions: buildFallbackQuestions(payload.interviewerStyleId) }));
  }

  const timeout = createTimeoutSignal();
  try {
    const promptOverrides = await resolvePromptOverrides(payload);
    const result = await generateJsonWithRetry(buildQuestionsPrompt(payload, promptOverrides), { signal: timeout.signal });
    const data = validateQuestionsOutput(result.json);
    return NextResponse.json(okResponse(data));
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
