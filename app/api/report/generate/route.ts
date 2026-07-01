import { NextResponse } from "next/server";
import { generateInterviewReport, toReportGenerationError } from "@/lib/report/generation";
import { errorResponse, okResponse, validateReportRequest } from "@/lib/schemas/contracts";
import type { InterviewReport } from "@/lib/types";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(errorResponse<InterviewReport>("INPUT_INVALID", "请求体不是合法 JSON", false), { status: 400 });
  }

  if (!validateReportRequest(payload)) {
    return NextResponse.json(errorResponse<InterviewReport>("INPUT_INVALID", "报告生成参数不符合契约", false), { status: 400 });
  }

  try {
    const report = await generateInterviewReport(payload, request);
    return NextResponse.json(okResponse(report));
  } catch (error) {
    const reportError = toReportGenerationError(error);
    return NextResponse.json(errorResponse<InterviewReport>(reportError.code, reportError.message, reportError.retryable), {
      status: reportError.status
    });
  }
}
