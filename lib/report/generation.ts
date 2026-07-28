import { generateJsonWithRetry, isLlmConfigured, createTimeoutSignal, getLlmErrorCode } from "@/lib/ai/provider";
import { fallbackMeasurement, llmMeasurement } from "@/lib/ai/measurement";
import { shouldForceDemoFallback, shouldInjectDevFault } from "@/lib/dev/ops";
import { buildFallbackReport } from "@/lib/demo/fallback";
import { buildReportPrompt } from "@/lib/prompts/interview";
import { resolvePromptOverrides } from "@/lib/prompts/promptStore";
import { validateReportOutput } from "@/lib/schemas/contracts";
import type { CandidateProfile, GenerationResult, InterviewAnswer, InterviewQuestion, InterviewReport, InterviewerStyleId, PromptOverrides, QuestionReport } from "@/lib/types";

const REPORT_LLM_TIMEOUT_MS = 60000;

export interface ReportGenerationPayload {
  candidateProfile: CandidateProfile;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  interviewerStyleId?: InterviewerStyleId;
  promptOverrides?: PromptOverrides;
}

export class ReportGenerationError extends Error {
  code: string;
  retryable: boolean;
  status: number;

  constructor(code: string, message: string, retryable = true, status = 502) {
    super(message);
    this.name = "ReportGenerationError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export async function generateInterviewReportWithMeasurement(
  payload: ReportGenerationPayload,
  request?: Request
): Promise<GenerationResult<InterviewReport>> {
  if (shouldInjectDevFault(request, "llm")) {
    throw new ReportGenerationError("LLM_PROVIDER_FAILED", "开发故障注入：报告生成失败。", true, 502);
  }

  if (shouldForceDemoFallback(request) || !isLlmConfigured()) {
    return {
      data: buildFallbackReport(payload.questions, payload.answers),
      measurement: fallbackMeasurement()
    };
  }

  const timeout = createTimeoutSignal(REPORT_LLM_TIMEOUT_MS);
  try {
    const promptOverrides = await resolvePromptOverrides(payload);
    const result = await generateJsonWithRetry(buildReportPrompt(payload, promptOverrides), { signal: timeout.signal });
    return {
      data: validateReportOutput(
        result.json,
        payload.questions.map((question) => question.id)
      ),
      measurement: llmMeasurement(result)
    };
  } catch (error) {
    const code = getLlmErrorCode(error);
    const message =
      code === "LLM_SCHEMA_INVALID" ? "报告生成结果结构不符合契约，请重试或使用演示报告。" : "报告生成失败，请重试或使用演示报告。";
    throw new ReportGenerationError(code, message, true, 502);
  } finally {
    timeout.clear();
  }
}

export async function generateInterviewReport(
  payload: ReportGenerationPayload,
  request?: Request
): Promise<InterviewReport> {
  return (await generateInterviewReportWithMeasurement(payload, request)).data;
}

export async function regenerateQuestionReport(
  payload: ReportGenerationPayload,
  questionId: string,
  request?: Request
): Promise<QuestionReport> {
  const report = await generateInterviewReport(payload, request);
  const questionReport = report.questionReports.find((item) => item.questionId === questionId);

  if (!questionReport) {
    throw new ReportGenerationError("LLM_SCHEMA_INVALID", "单题报告缺少目标 questionId，请重试或使用演示兜底。", true, 502);
  }

  return questionReport;
}

export function toReportGenerationError(error: unknown) {
  if (error instanceof ReportGenerationError) {
    return error;
  }
  return new ReportGenerationError("LLM_PROVIDER_FAILED", "报告生成失败，请重试或使用演示报告。", true, 502);
}
