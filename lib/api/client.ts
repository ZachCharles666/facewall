import type {
  CandidateProfile,
  CommonResponse,
  GenerationMeasurement,
  GenerationResult,
  GenerationSource,
  InterviewAnswer,
  InterviewQuestion,
  InterviewReport,
  InterviewSessionSnapshot,
  InterviewerStyleId,
  PromptOverrides,
  PromptStoreSnapshot,
  QuestionReport,
  SpeechSettingsSnapshot,
  VoiceOption
} from "@/lib/types";
import { getDevRequestHeaders } from "@/lib/dev/clientControls";

// Generation can legitimately take a while — the server allows 35s per attempt
// and retries once — but never forever. A request that hangs leaves the app on
// a spinner with no way out, which has stranded candidates mid-setup.
const REQUEST_TIMEOUT_MS = 120_000;

async function fetchJson(url: string, init: RequestInit) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("等待服务器响应的时间太长了，请重试一次。");
    }
    throw new Error("网络好像不太通畅，请稍后重试。");
  }
}

async function postJson<TData, TPayload>(url: string, payload: TPayload, devFault?: "llm"): Promise<TData> {
  const response = await fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getDevRequestHeaders(devFault)
    },
    body: JSON.stringify(payload)
  });
  const body = (await response.json()) as CommonResponse<TData>;

  if (!body.ok) {
    throw new Error(body.error.message);
  }

  return body.data;
}

function responseMeasurement<T>(
  body: Extract<CommonResponse<T>, { ok: true }>
): GenerationMeasurement {
  return (
    body.meta?.generation ?? {
      source: "mixed",
      provider: null,
      model: null,
      latencyMs: null,
      attempts: null,
      inputTokens: null,
      outputTokens: null,
      requestId: body.requestId
    }
  );
}

async function postJsonWithGeneration<TData, TPayload>(
  url: string,
  payload: TPayload,
  devFault?: "llm"
): Promise<GenerationResult<TData>> {
  const response = await fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getDevRequestHeaders(devFault)
    },
    body: JSON.stringify(payload)
  });
  const body = (await response.json()) as CommonResponse<TData>;
  if (!body.ok) throw new Error(body.error.message);
  return { data: body.data, measurement: responseMeasurement(body) };
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly currentVersion?: number
  ) {
    super(message);
  }
}

async function requestCommon<TData>(
  url: string,
  init?: RequestInit
): Promise<TData> {
  const response = await fetchJson(url, { cache: "no-store", ...init });
  const body = (await response.json()) as
    | Extract<CommonResponse<TData>, { ok: true }>
    | (Extract<CommonResponse<TData>, { ok: false }> & {
        error: Extract<CommonResponse<TData>, { ok: false }>["error"] & {
          currentVersion?: number;
        };
      });
  if (!body.ok) {
    throw new ApiClientError(
      body.error.message,
      body.error.code,
      body.error.retryable,
      "currentVersion" in body.error
        ? Number(body.error.currentVersion)
        : undefined
    );
  }
  return body.data;
}

function jsonRequest(method: "POST" | "PATCH" | "PUT", payload: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  };
}

export function createPersistedInterviewSession(payload: {
  resumeText: string;
  jdText: string;
  interviewerStyleId: InterviewerStyleId;
  idempotencyKey: string;
}) {
  return requestCommon<{
    sessionId: string;
    status: "draft";
    version: number;
    quota: { limit: number; used: number; remaining: number };
  }>("/api/interview-sessions", jsonRequest("POST", payload));
}

export function getCurrentPersistedInterviewSession() {
  return requestCommon<InterviewSessionSnapshot | null>(
    "/api/interview-sessions/current"
  );
}

export function getPersistedInterviewSession(sessionId: string) {
  return requestCommon<InterviewSessionSnapshot>(
    `/api/interview-sessions/${encodeURIComponent(sessionId)}`
  );
}

export function savePersistedMilestone(
  sessionId: string,
  payload: {
    expectedVersion: number;
    milestone: "profile_ready" | "questions_ready";
    candidateProfile?: CandidateProfile;
    questions?: InterviewQuestion[];
    generationSource: GenerationSource;
    measurement?: GenerationMeasurement;
    idempotencyKey: string;
  }
) {
  return requestCommon<InterviewSessionSnapshot>(
    `/api/interview-sessions/${encodeURIComponent(sessionId)}`,
    {
      ...jsonRequest("PATCH", payload),
      headers: {
        "content-type": "application/json",
        ...getDevRequestHeaders("database")
      }
    }
  );
}

export function savePersistedAnswer(
  sessionId: string,
  answer: InterviewAnswer,
  idempotencyKey: string
) {
  return requestCommon<InterviewSessionSnapshot>(
    `/api/interview-sessions/${encodeURIComponent(sessionId)}/answers/${encodeURIComponent(answer.questionId)}`,
    jsonRequest("PUT", {
      ...answer,
      idempotencyKey
    })
  );
}

export function savePersistedReport(
  sessionId: string,
  payload: {
    expectedVersion: number;
    report: InterviewReport;
    generationSource: GenerationSource;
    measurement?: GenerationMeasurement;
    idempotencyKey: string;
  }
) {
  return requestCommon<InterviewSessionSnapshot>(
    `/api/interview-sessions/${encodeURIComponent(sessionId)}/report`,
    jsonRequest("POST", payload)
  );
}

export function completePersistedInterviewSession(
  sessionId: string,
  expectedVersion: number,
  idempotencyKey: string
) {
  return requestCommon<InterviewSessionSnapshot>(
    `/api/interview-sessions/${encodeURIComponent(sessionId)}/complete`,
    jsonRequest("POST", { expectedVersion, idempotencyKey })
  );
}

export function parseProfile(payload: {
  resumeText: string;
  jdText: string;
  interviewerStyleId: InterviewerStyleId;
  promptOverrides?: PromptOverrides;
}) {
  return postJsonWithGeneration<CandidateProfile, typeof payload>(
    "/api/profile/parse",
    payload,
    "llm"
  );
}

export function generateQuestions(payload: {
  candidateProfile: CandidateProfile;
  interviewerStyleId: InterviewerStyleId;
  questionCount: 3;
  promptOverrides?: PromptOverrides;
}) {
  return postJsonWithGeneration<
    { questions: InterviewQuestion[] },
    typeof payload
  >("/api/questions/generate", payload, "llm");
}

export function generateReport(payload: {
  candidateProfile: CandidateProfile;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  interviewerStyleId?: InterviewerStyleId;
  promptOverrides?: PromptOverrides;
}) {
  return postJsonWithGeneration<InterviewReport, typeof payload>(
    "/api/report/generate",
    payload,
    "llm"
  );
}

export interface ReportStreamProgress {
  stage: string;
  message: string;
}

export interface ReportStreamHandlers {
  onProgress?: (progress: ReportStreamProgress) => void;
  onQuestionReport?: (questionReport: QuestionReport & { partial?: boolean; message?: string }) => void;
  signal?: AbortSignal;
}

export async function generateReportStream(
  payload: {
    candidateProfile: CandidateProfile;
    questions: InterviewQuestion[];
    answers: InterviewAnswer[];
    interviewerStyleId?: InterviewerStyleId;
    promptOverrides?: PromptOverrides;
  },
  handlers: ReportStreamHandlers = {}
) {
  const response = await fetch("/api/report/generate-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getDevRequestHeaders("llm")
    },
    body: JSON.stringify(payload),
    signal: handlers.signal
  });

  if (!response.ok) {
    const body = (await response.json()) as CommonResponse<InterviewReport>;
    throw new Error(body.ok ? "流式报告生成失败。" : body.error.message);
  }

  if (!response.body) {
    throw new Error("当前浏览器不支持流式响应，已切换到非流式报告兜底。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalReport: InterviewReport | null = null;
  let measurement: GenerationMeasurement | null = null;

  function handleEventBlock(block: string) {
    const lines = block.split(/\r?\n/);
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataLines = lines.filter((line) => line.startsWith("data:"));
    const eventName = eventLine?.replace(/^event:\s*/, "").trim();
    const dataText = dataLines.map((line) => line.replace(/^data:\s*/, "")).join("\n");

    if (!eventName || !dataText) return;

    const data = JSON.parse(dataText) as unknown;
    if (eventName === "progress") {
      handlers.onProgress?.(data as ReportStreamProgress);
      return;
    }
    if (eventName === "questionReport") {
      handlers.onQuestionReport?.(data as QuestionReport & { partial?: boolean; message?: string });
      return;
    }
    if (eventName === "final") {
      finalReport = data as InterviewReport;
      return;
    }
    if (eventName === "measurement") {
      measurement = data as GenerationMeasurement;
      return;
    }
    if (eventName === "error") {
      const errorData = data as { message?: string };
      throw new Error(errorData.message ?? "流式报告生成失败。");
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\n\n/);
    buffer = blocks.pop() ?? "";
    blocks.forEach(handleEventBlock);
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    handleEventBlock(buffer);
  }

  if (!finalReport) {
    throw new Error("流式报告缺少 final 事件，已切换到非流式报告兜底。");
  }

  return {
    data: finalReport,
    measurement:
      measurement ?? {
        source: "mixed",
        provider: null,
        model: null,
        latencyMs: null,
        attempts: null,
        inputTokens: null,
        outputTokens: null,
        requestId: response.headers.get("x-request-id")
      }
  } satisfies GenerationResult<InterviewReport>;
}

export function regenerateQuestionReport(payload: {
  candidateProfile: CandidateProfile;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  questionId: string;
  interviewerStyleId?: InterviewerStyleId;
  promptOverrides?: PromptOverrides;
}) {
  return postJson<QuestionReport, typeof payload>("/api/report/regenerate-question", payload, "llm");
}

export async function getActivePromptOverrides() {
  const response = await fetch("/api/prompts/active", {
    method: "GET",
    cache: "no-store"
  });
  const body = (await response.json()) as CommonResponse<PromptStoreSnapshot>;

  if (!body.ok) {
    throw new Error(body.error.message);
  }

  return body.data;
}

export function saveActivePromptOverrides(promptOverrides: PromptOverrides) {
  return postJson<PromptStoreSnapshot, { promptOverrides: PromptOverrides }>("/api/prompts/active", { promptOverrides });
}

export async function getSessionQuestionnaireSnapshot(sessionId: string) {
  const response = await fetch(`/api/interview-sessions/${sessionId}/questionnaire`, {
    cache: "no-store"
  });
  if (!response.ok) throw new Error("questionnaire unavailable");
  const body = (await response.json()) as {
    data: { eligible: boolean; response: { id: string } | null };
  };
  return body.data;
}

export async function getActiveSpeechSettings() {
  const response = await fetch("/api/speech-settings/active", {
    method: "GET",
    cache: "no-store"
  });
  const body = (await response.json()) as CommonResponse<SpeechSettingsSnapshot>;

  if (!body.ok) {
    throw new Error(body.error.message);
  }

  return body.data;
}

export function saveActiveSpeechSettings(
  speechTunings: SpeechSettingsSnapshot["speechTunings"],
  ttsEngine?: SpeechSettingsSnapshot["ttsEngine"]
) {
  return postJson<
    SpeechSettingsSnapshot,
    { speechTunings: SpeechSettingsSnapshot["speechTunings"]; ttsEngine?: SpeechSettingsSnapshot["ttsEngine"] }
  >("/api/speech-settings/active", { speechTunings, ttsEngine });
}

export async function requestTtsAudio(payload: {
  text: string;
  styleId: InterviewerStyleId;
  /** Which server engine to try first. Omitted lets the server decide. */
  engine?: "tencent" | "azure";
  voiceName?: string;
  tencentVoiceType?: number;
  rate?: number | string;
  pitch?: number | string;
  volume?: number | string;
}, options?: { signal?: AbortSignal }) {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getDevRequestHeaders("tts")
    },
    body: JSON.stringify(payload),
    signal: options?.signal
  });

  if (!response.ok) {
    throw new Error("服务端 TTS 不可用，已切换到浏览器语音兜底。");
  }

  return response.blob();
}

// A long answer is uploaded as several segments and the caller waits for all of
// them. Without a bound, one stalled upload leaves the interview frozen on
// "正在识别你的回答" with no way forward, so a slow segment has to fail instead.
const STT_REQUEST_TIMEOUT_MS = 90_000;

export async function requestSttTranscript(audio: Blob) {
  let response: Response;
  try {
    response = await fetch("/api/stt", {
      method: "POST",
      headers: {
        "Content-Type": audio.type || "audio/wav",
        ...getDevRequestHeaders("tts")
      },
      body: audio,
      signal: AbortSignal.timeout(STT_REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("等待识别的时间太长了，网络可能不太稳定，可以再说一次或直接打字。");
    }
    throw new Error("网络好像不太通畅，可以再说一次或直接打字。");
  }

  const payload = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
  if (!response.ok || !payload?.text) {
    throw new Error(payload?.error || "服务端语音识别失败，已保留当前文本，可重试或手动编辑。");
  }

  return payload.text;
}

export async function getAzureSpeechStatus() {
  const response = await fetch("/api/azure-status", {
    method: "GET",
    cache: "no-store",
    headers: getDevRequestHeaders("tts")
  });

  if (!response.ok) {
    throw new Error("语音服务状态查询失败。");
  }

  return (await response.json()) as {
    configured: boolean;
    provider: "tencent" | "azure" | "web-speech";
    region: string;
    voices: VoiceOption[];
  };
}
