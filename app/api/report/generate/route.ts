import { NextResponse } from "next/server";
import { generateInterviewReportWithMeasurement, toReportGenerationError } from "@/lib/report/generation";
import { errorResponse, okResponse, validateReportRequest } from "@/lib/schemas/contracts";
import { observeRoute } from "@/lib/observability/route";
import type { InterviewReport } from "@/lib/types";

async function handlePost(request: Request) {
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
    const result = await generateInterviewReportWithMeasurement(payload, request);
    return NextResponse.json(
      okResponse(result.data, { generation: result.measurement })
    );
  } catch (error) {
    const reportError = toReportGenerationError(error);
    return NextResponse.json(errorResponse<InterviewReport>(reportError.code, reportError.message, reportError.retryable), {
      status: reportError.status
    });
  }
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    { route: "/api/report/generate", critical: true },
    () => handlePost(request)
  );
}
