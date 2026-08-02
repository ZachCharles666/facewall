import { generateJsonWithRetry, isLlmConfigured, createTimeoutSignal, getLlmErrorCode } from "@/lib/ai/provider";
import { fallbackMeasurement } from "@/lib/ai/measurement";
import { shouldForceDemoFallback, shouldInjectDevFault } from "@/lib/dev/ops";
import { buildFallbackReport } from "@/lib/demo/fallback";
import { buildFinalReportPrompt, buildQuestionReportPrompt } from "@/lib/prompts/interview";
import { resolvePromptOverrides } from "@/lib/prompts/promptStore";
import { validateFinalReportSummary, validateQuestionReport, validateReportOutput } from "@/lib/schemas/contracts";
import type { CandidateProfile, GenerationMeasurement, GenerationResult, InterviewAnswer, InterviewQuestion, InterviewReport, InterviewerStyleId, PromptOverrides, QuestionReport } from "@/lib/types";
import type { LlmJsonResult } from "@/lib/ai/provider";
import { getCurrentRequestId } from "@/lib/observability/context";

const QUESTION_REPORT_TIMEOUT_MS = 35000;
const FINAL_REPORT_TIMEOUT_MS = 35000;
const QUESTION_REPORT_CONCURRENCY = 2;

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
  request?: Request,
  onQuestionReport?: (report: QuestionReport, completed: number) => void
): Promise<GenerationResult<InterviewReport>> {
  if (shouldInjectDevFault(request, "llm")) {
    throw new ReportGenerationError("LLM_PROVIDER_FAILED", "开发故障注入：报告生成失败。", true, 502);
  }

  if (shouldForceDemoFallback(request) || !isLlmConfigured()) {
    const report = buildFallbackReport(payload.questions, payload.answers);
    report.questionReports.forEach((questionReport, index) => onQuestionReport?.(questionReport, index + 1));
    return {
      data: report,
      measurement: fallbackMeasurement()
    };
  }

  const startedAt = performance.now();
  try {
    const promptOverrides = await resolvePromptOverrides(payload);
    const questionReports = new Array<QuestionReport>(payload.questions.length);
    const measurements: LlmJsonResult[] = [];
    let nextQuestionIndex = 0;
    let completed = 0;

    async function worker() {
      while (true) {
        const questionIndex = nextQuestionIndex;
        nextQuestionIndex += 1;
        if (questionIndex >= payload.questions.length) return;
        const question = payload.questions[questionIndex];
        const answer = payload.answers.find((item) => item.questionId === question.id) ?? {
          questionId: question.id,
          answerText: "",
          inputMode: "text" as const,
          durationSec: 0,
          sttStatus: "idle" as const
        };
        const generated = await generateOneQuestionReport(
          payload,
          question,
          answer,
          promptOverrides,
          request?.signal
        );
        questionReports[questionIndex] = generated.report;
        measurements.push(generated.measurement);
        completed += 1;
        onQuestionReport?.(generated.report, completed);
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(QUESTION_REPORT_CONCURRENCY, payload.questions.length) },
        () => worker()
      )
    );

    const finalTimeout = createTimeoutSignal(FINAL_REPORT_TIMEOUT_MS, request?.signal);
    let finalResult: LlmJsonResult;
    try {
      finalResult = await generateJsonWithRetry(
        buildFinalReportPrompt(
          { questionReports, interviewerStyleId: payload.interviewerStyleId },
          promptOverrides
        ),
        { signal: finalTimeout.signal, maxAttempts: 2, maxTokens: 700 }
      );
    } finally {
      finalTimeout.clear();
    }
    if (!validateFinalReportSummary(finalResult.json)) {
      throw new Error("LLM_SCHEMA_INVALID: FinalReportSummary");
    }
    measurements.push(finalResult);
    const overallScore = Math.round(
      questionReports.reduce((total, report) => total + report.score, 0) / questionReports.length
    );
    const report: InterviewReport = {
      questionReports,
      finalReport: {
        overallScore,
        summary: finalResult.json.summary,
        topRisks: finalResult.json.topRisks,
        actionItems: finalResult.json.actionItems,
        copyText: buildReportCopyText(questionReports, finalResult.json.summary, overallScore)
      }
    };
    return {
      data: validateReportOutput(
        report,
        payload.questions.map((question) => question.id)
      ),
      measurement: combineMeasurements(measurements, Math.round(performance.now() - startedAt))
    };
  } catch (error) {
    const code = getLlmErrorCode(error);
    const message =
      code === "LLM_SCHEMA_INVALID" ? "报告生成结果结构不符合契约，请重试或使用演示报告。" : "报告生成失败，请重试或使用演示报告。";
    throw new ReportGenerationError(code, message, true, 502);
  }
}

async function generateOneQuestionReport(
  payload: ReportGenerationPayload,
  question: InterviewQuestion,
  answer: InterviewAnswer,
  promptOverrides: PromptOverrides,
  parentSignal?: AbortSignal
) {
  const timeout = createTimeoutSignal(QUESTION_REPORT_TIMEOUT_MS, parentSignal);
  try {
    const result = await generateJsonWithRetry(
      buildQuestionReportPrompt(
        {
          candidateProfile: payload.candidateProfile,
          question,
          answer,
          interviewerStyleId: payload.interviewerStyleId
        },
        promptOverrides
      ),
      { signal: timeout.signal, maxAttempts: 2, maxTokens: 1200 }
    );
    if (!validateQuestionReport(result.json) || result.json.questionId !== question.id) {
      throw new Error("LLM_SCHEMA_INVALID: QuestionReport");
    }
    return { report: result.json, measurement: result };
  } finally {
    timeout.clear();
  }
}

function buildReportCopyText(questionReports: QuestionReport[], summary: string, overallScore: number) {
  const optimizedAnswers = questionReports
    .map((report, index) => `第 ${index + 1} 题优化答案\n${report.optimizedAnswer}`)
    .join("\n\n");
  return `优化答案\n\n${optimizedAnswers}\n\n复盘报告\n总分：${overallScore}\n${summary}`;
}

function combineMeasurements(results: LlmJsonResult[], latencyMs: number): GenerationMeasurement {
  const first = results[0];
  const sumNullable = (values: Array<number | null>) =>
    values.every((value) => value === null)
      ? null
      : values.reduce<number>((total, value) => total + (value ?? 0), 0);
  return {
    source: "llm",
    provider: first?.provider ?? null,
    model: first?.model ?? null,
    latencyMs,
    attempts: results.reduce((total, result) => total + result.attempts, 0),
    inputTokens: sumNullable(results.map((result) => result.usage.inputTokens)),
    outputTokens: sumNullable(results.map((result) => result.usage.outputTokens)),
    requestId: getCurrentRequestId() ?? null
  };
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
  const question = payload.questions.find((item) => item.id === questionId);
  if (!question) {
    throw new ReportGenerationError("LLM_SCHEMA_INVALID", "单题报告缺少目标 questionId，请重试或使用演示兜底。", true, 502);
  }
  if (shouldForceDemoFallback(request) || !isLlmConfigured()) {
    return buildFallbackReport(payload.questions, payload.answers).questionReports.find((item) => item.questionId === questionId)!;
  }
  const promptOverrides = await resolvePromptOverrides(payload);
  const answer = payload.answers.find((item) => item.questionId === questionId) ?? {
    questionId,
    answerText: "",
    inputMode: "text" as const,
    durationSec: 0,
    sttStatus: "idle" as const
  };
  return (await generateOneQuestionReport(payload, question, answer, promptOverrides, request?.signal)).report;
}

export function toReportGenerationError(error: unknown) {
  if (error instanceof ReportGenerationError) {
    return error;
  }
  return new ReportGenerationError("LLM_PROVIDER_FAILED", "报告生成失败，请重试或使用演示报告。", true, 502);
}
