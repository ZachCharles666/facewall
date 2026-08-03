export type InterviewerStyleId = "strictHr" | "techBro" | "gentleSister";

export type VisualTheme = "classic" | "figma" | "juju";

export type InputMode = "voice" | "text" | "edited";

export type SttStatus = "idle" | "recording" | "success" | "failed" | "unsupported" | "manual";

export type TtsStatus = "idle" | "loading" | "speaking" | "ended" | "failed" | "unsupported";

export type TtsEngine = "azure" | "web";

export type SessionStep = "setup" | "profile" | "questions" | "interview" | "report";

export type PersistedSessionStatus =
  | "draft"
  | "profile_ready"
  | "questions_ready"
  | "in_progress"
  | "report_ready"
  | "completed"
  | "abandoned";

export type GenerationSource = "llm" | "demo_fallback" | "mixed";

export interface GenerationMeasurement {
  source: GenerationSource;
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  attempts: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  requestId: string | null;
}

export interface GenerationResult<T> {
  data: T;
  measurement: GenerationMeasurement;
}

export type QuestionType = "behavior" | "project" | "pressure" | "technical" | "motivation";

export type QuestionDifficulty = "easy" | "medium" | "hard";

export type EvidenceSource = "resume" | "jd" | "inferred";

export interface CommonError {
  code: string;
  message: string;
  retryable: boolean;
}

export type CommonResponse<T> =
  | {
      ok: true;
      data: T;
      error: null;
      requestId: string;
      meta?: {
        generation?: GenerationMeasurement;
      };
    }
  | {
      ok: false;
      data: null;
      error: CommonError;
      requestId: string;
    };

export interface EvidenceMaterial {
  title: string;
  source: EvidenceSource;
  content: string;
}

export interface SourceMatch {
  resumeText: string;
  jdText: string;
  reason: string;
  confidence: number;
}

export interface CandidateProfile {
  summary: string;
  matchedPoints: string[];
  riskPoints: string[];
  keywords: string[];
  evidenceMaterials: EvidenceMaterial[];
  sourceMatches: SourceMatch[];
  suggestedSupplements: string[];
}

export interface InterviewQuestion {
  id: string;
  type: QuestionType;
  title: string;
  questionText: string;
  intent: string;
  expectedSignals: string[];
  difficulty: QuestionDifficulty;
}

export interface InterviewAnswer {
  questionId: string;
  answerText: string;
  inputMode: InputMode;
  durationSec: number;
  sttStatus: SttStatus;
}

export interface DimensionScores {
  jobRelevance: number;
  structure: number;
  evidence: number;
  professionalExpression: number;
  truthBoundary: number;
  completeness: number;
}

export interface QuestionReport {
  questionId: string;
  score: number;
  dimensionScores: DimensionScores;
  riskTags: string[];
  fatalIssue: string;
  diagnosis: string;
  optimizedAnswer: string;
  oralVersion60s: string;
}

export interface FinalReport {
  overallScore: number;
  summary: string;
  topRisks: string[];
  actionItems: string[];
  copyText: string;
}

export interface InterviewReport {
  questionReports: QuestionReport[];
  finalReport: FinalReport;
}

export interface InterviewerPromptProfile {
  persona: string;
  questions: string;
  report: string;
}

export interface PromptOverrides {
  system: string;
  profile: string;
  questions: string;
  report: string;
  interviewers: Record<InterviewerStyleId, InterviewerPromptProfile>;
}

export interface PromptStoreSnapshot {
  promptOverrides: PromptOverrides;
  updatedAt: string | null;
}

export interface DemoScenario {
  scenarioId: string;
  label: string;
  resumeText: string;
  jdText: string;
  defaultInterviewerStyleId: InterviewerStyleId;
  candidateProfile: CandidateProfile;
  questions: InterviewQuestion[];
  sampleAnswers: InterviewAnswer[];
  report: InterviewReport;
}

export interface SetupForm {
  resumeText: string;
  jdText: string;
  interviewerStyleId: InterviewerStyleId;
}

export interface SessionQuota {
  limit: number;
  used: number;
  remaining: number;
}

export interface InterviewSessionSnapshot {
  sessionId: string;
  status: PersistedSessionStatus;
  version: number;
  schemaVersion: number;
  resumeText: string;
  jdText: string;
  interviewerStyleId: InterviewerStyleId;
  candidateProfile: CandidateProfile | null;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  report: InterviewReport | null;
  generationSource: GenerationSource;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceOption {
  value: string;
  label: string;
}

export interface SpeechTuning {
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
  /**
   * Tencent voice id for this persona. 0 means inherit the server default, so a
   * deployment that never touches the panel keeps working. Free-form rather
   * than a fixed list because which ids an account can use varies.
   */
  tencentVoiceType: number;
}

export type PersonaSpeechTunings = Record<InterviewerStyleId, SpeechTuning>;

export interface SpeechSettingsSnapshot {
  speechTunings: PersonaSpeechTunings;
  updatedAt: string | null;
}
