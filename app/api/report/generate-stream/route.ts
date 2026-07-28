import { NextResponse } from "next/server";
import { generateInterviewReportWithMeasurement, toReportGenerationError } from "@/lib/report/generation";
import { errorResponse, validateReportRequest } from "@/lib/schemas/contracts";
import type { InterviewReport } from "@/lib/types";
import { structuredLog } from "@/lib/observability/logger";
import { observeRoute } from "@/lib/observability/route";

function encodeSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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

  const encoder = new TextEncoder();
  const generationStartedAt = performance.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(encodeSse(event, data)));

      try {
        send("progress", { stage: "queued", message: "正在准备报告生成任务" });
        send("progress", { stage: "scoring", message: "正在评估 3 道题的回答质量" });

        const result = await generateInterviewReportWithMeasurement(payload, request);
        const report = result.data;

        report.questionReports.forEach((questionReport, index) => {
          send("questionReport", {
            ...questionReport,
            partial: false,
            message: `第 ${index + 1} 题报告已生成`
          });
        });

        send("progress", { stage: "finalizing", message: "正在汇总最终复盘报告" });
        send("measurement", result.measurement);
        send("final", report);
      } catch (error) {
        const reportError = toReportGenerationError(error);
        structuredLog("error", "report.stream.failed", {
          errorCode: reportError.code,
          durationMs: Math.round(performance.now() - generationStartedAt)
        });
        send("error", {
          code: reportError.code,
          message: reportError.message,
          retryable: reportError.retryable
        });
      } finally {
        structuredLog("info", "report.stream.completed", {
          durationMs: Math.round(performance.now() - generationStartedAt)
        });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    { route: "/api/report/generate-stream", critical: true },
    () => handlePost(request)
  );
}
