import type {
  CandidateProfile,
  CommonResponse,
  DimensionScores,
  EvidenceMaterial,
  InterviewAnswer,
  InterviewQuestion,
  InterviewReport,
  InterviewerStyleId,
  QuestionDifficulty,
  QuestionReport,
  QuestionType,
  SourceMatch,
  SttStatus
} from "@/lib/types";

export const interviewerStyleIds: InterviewerStyleId[] = ["strictHr", "techBro", "gentleSister"];
const evidenceSources = ["resume", "jd", "inferred"];
const questionTypes: QuestionType[] = ["behavior", "project", "pressure", "technical", "motivation"];
const questionDifficulties: QuestionDifficulty[] = ["easy", "medium", "hard"];
const sttStatuses: SttStatus[] = ["idle", "recording", "success", "failed", "unsupported", "manual"];
const inputModes = ["voice", "text", "edited"];
const dimensionKeys: Array<keyof DimensionScores> = [
  "jobRelevance",
  "structure",
  "evidence",
  "professionalExpression",
  "truthBoundary",
  "completeness"
];

export function createRequestId(prefix = "local") {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function okResponse<T>(data: T): CommonResponse<T> {
  return {
    ok: true,
    data,
    error: null,
    requestId: createRequestId()
  };
}

export function errorResponse<T>(code: string, message: string, retryable = true): CommonResponse<T> {
  return {
    ok: false,
    data: null,
    error: {
      code,
      message,
      retryable
    },
    requestId: createRequestId()
  };
}

export function isInterviewerStyleId(value: unknown): value is InterviewerStyleId {
  return typeof value === "string" && interviewerStyleIds.includes(value as InterviewerStyleId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown, minLength = 0): value is string[] {
  return Array.isArray(value) && value.length >= minLength && value.every(isNonEmptyString);
}

function isNumberInRange(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function validateSetupPayload(value: unknown): value is {
  resumeText: string;
  jdText: string;
  interviewerStyleId: InterviewerStyleId;
} {
  if (!isRecord(value)) return false;
  const payload = value;
  return (
    typeof payload.resumeText === "string" &&
    typeof payload.jdText === "string" &&
    payload.resumeText.trim().length >= 20 &&
    payload.jdText.trim().length >= 20 &&
    isInterviewerStyleId(payload.interviewerStyleId)
  );
}

export function validateCandidateProfile(value: unknown): value is CandidateProfile {
  if (!isRecord(value)) return false;
  const profile = value as Partial<CandidateProfile>;
  return (
    isNonEmptyString(profile.summary) &&
    isStringArray(profile.matchedPoints, 1) &&
    isStringArray(profile.riskPoints) &&
    isStringArray(profile.keywords, 1) &&
    validateEvidenceMaterials(profile.evidenceMaterials) &&
    validateSourceMatches(profile.sourceMatches) &&
    isStringArray(profile.suggestedSupplements)
  );
}

function validateEvidenceMaterials(value: unknown): value is EvidenceMaterial[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 5 &&
    value.every((item) => {
      if (!isRecord(item)) return false;
      return (
        isNonEmptyString(item.title) &&
        typeof item.source === "string" &&
        evidenceSources.includes(item.source) &&
        isNonEmptyString(item.content)
      );
    })
  );
}

function validateSourceMatches(value: unknown): value is SourceMatch[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => {
      if (!isRecord(item)) return false;
      return (
        isNonEmptyString(item.resumeText) &&
        isNonEmptyString(item.jdText) &&
        isNonEmptyString(item.reason) &&
        isNumberInRange(item.confidence, 0, 1)
      );
    })
  );
}

export function validateQuestionRequest(value: unknown): value is {
  candidateProfile: CandidateProfile;
  interviewerStyleId: InterviewerStyleId;
  questionCount: 3;
} {
  if (!isRecord(value)) return false;
  const payload = value;
  return (
    validateCandidateProfile(payload.candidateProfile) &&
    isInterviewerStyleId(payload.interviewerStyleId) &&
    payload.questionCount === 3
  );
}

export function validateQuestions(value: unknown): value is InterviewQuestion[] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((question) => {
      if (!isRecord(question)) return false;
      const item = question;
      return (
        isNonEmptyString(item.id) &&
        typeof item.type === "string" &&
        questionTypes.includes(item.type as QuestionType) &&
        isNonEmptyString(item.title) &&
        isNonEmptyString(item.questionText) &&
        isNonEmptyString(item.intent) &&
        isStringArray(item.expectedSignals, 1) &&
        typeof item.difficulty === "string" &&
        questionDifficulties.includes(item.difficulty as QuestionDifficulty)
      );
    })
  );
}

export function validateReportRequest(value: unknown): value is {
  candidateProfile: CandidateProfile;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
} {
  if (!isRecord(value)) return false;
  const payload = value;
  return (
    validateCandidateProfile(payload.candidateProfile) &&
    validateQuestions(payload.questions) &&
    Array.isArray(payload.answers) &&
    payload.answers.every((answer) => {
      if (!isRecord(answer)) return false;
      return (
        isNonEmptyString(answer.questionId) &&
        typeof answer.answerText === "string" &&
        typeof answer.inputMode === "string" &&
        inputModes.includes(answer.inputMode) &&
        isNumberInRange(answer.durationSec, 0, 7200) &&
        typeof answer.sttStatus === "string" &&
        sttStatuses.includes(answer.sttStatus as SttStatus)
      );
    })
  );
}

export function validateReport(value: unknown): value is InterviewReport {
  if (!isRecord(value)) return false;
  const report = value as Partial<InterviewReport>;
  return (
    Array.isArray(report.questionReports) &&
    report.questionReports.length === 3 &&
    report.questionReports.every(validateQuestionReport) &&
    isRecord(report.finalReport) &&
    isNumberInRange(report.finalReport.overallScore, 0, 100) &&
    isNonEmptyString(report.finalReport.summary) &&
    isStringArray(report.finalReport.topRisks) &&
    isStringArray(report.finalReport.actionItems) &&
    isNonEmptyString(report.finalReport.copyText) &&
    report.finalReport.copyText.includes("优化答案") &&
    report.finalReport.copyText.includes("复盘报告")
  );
}

function validateQuestionReport(value: unknown): value is QuestionReport {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.questionId) &&
    isNumberInRange(value.score, 0, 100) &&
    validateDimensionScores(value.dimensionScores) &&
    isStringArray(value.riskTags) &&
    isNonEmptyString(value.fatalIssue) &&
    isNonEmptyString(value.diagnosis) &&
    isNonEmptyString(value.optimizedAnswer) &&
    isNonEmptyString(value.oralVersion60s)
  );
}

function validateDimensionScores(value: unknown): value is DimensionScores {
  if (!isRecord(value)) return false;
  return dimensionKeys.every((key) => isNumberInRange(value[key], 0, 20));
}

export function validateProfileOutput(value: unknown): CandidateProfile {
  if (!validateCandidateProfile(value)) {
    throw new Error("LLM_SCHEMA_INVALID: CandidateProfile");
  }
  return value;
}

export function validateQuestionsOutput(value: unknown): { questions: InterviewQuestion[] } {
  if (!isRecord(value) || !validateQuestions(value.questions)) {
    throw new Error("LLM_SCHEMA_INVALID: InterviewQuestion[]");
  }
  return { questions: value.questions };
}

export function validateReportOutput(value: unknown, questionIds?: string[]): InterviewReport {
  if (!validateReport(value)) {
    throw new Error("LLM_SCHEMA_INVALID: InterviewReport");
  }
  if (questionIds) {
    const reportIds = value.questionReports.map((report) => report.questionId);
    if (!questionIds.every((id) => reportIds.includes(id))) {
      throw new Error("LLM_SCHEMA_INVALID: questionId mismatch");
    }
  }
  return value;
}
