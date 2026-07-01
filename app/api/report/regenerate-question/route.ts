import { NextResponse } from "next/server";
import { regenerateQuestionReport, toReportGenerationError } from "@/lib/report/generation";
import { errorResponse, okResponse, validateReportRequest } from "@/lib/schemas/contracts";
import type { QuestionReport } from "@/lib/types";

function hasQuestionId(value: unknown): value is { questionId: string } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && typeof (value as { questionId?: unknown }).questionId === "string";
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(errorResponse<QuestionReport>("INPUT_INVALID", "请求体不是合法 JSON", false), { status: 400 });
  }

  if (!validateReportRequest(payload) || !hasQuestionId(payload)) {
    return NextResponse.json(errorResponse<QuestionReport>("INPUT_INVALID", "单题报告生成参数不符合契约", false), { status: 400 });
  }

  if (!payload.questions.some((question) => question.id === payload.questionId)) {
    return NextResponse.json(errorResponse<QuestionReport>("INPUT_INVALID", "目标题目不存在", false), { status: 400 });
  }

  try {
    const questionReport = await regenerateQuestionReport(payload, payload.questionId, request);
    return NextResponse.json(okResponse(questionReport));
  } catch (error) {
    const reportError = toReportGenerationError(error);
    return NextResponse.json(errorResponse<QuestionReport>(reportError.code, reportError.message, reportError.retryable), {
      status: reportError.status
    });
  }
}
