export type InterviewerStyleId = "strictHr" | "techBro" | "gentleSister";

export type InputMode = "voice" | "text" | "edited";

export type SttStatus = "idle" | "recording" | "success" | "failed" | "unsupported" | "manual";

export type TtsStatus = "idle" | "loading" | "speaking" | "ended" | "failed" | "unsupported";

export type TtsEngine = "azure" | "web";

export type SessionStep = "setup" | "profile" | "questions" | "interview" | "report";

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

export interface PromptOverrides {
  system: string;
  profile: string;
  questions: string;
  report: string;
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

export interface VoiceOption {
  value: string;
  label: string;
}

export interface SpeechTuning {
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
}
