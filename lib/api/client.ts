import type {
  CandidateProfile,
  CommonResponse,
  InterviewAnswer,
  InterviewQuestion,
  InterviewReport,
  InterviewerStyleId,
  PromptOverrides,
  PromptStoreSnapshot,
  QuestionReport,
  VoiceOption
} from "@/lib/types";
import { getDevRequestHeaders } from "@/lib/dev/clientControls";

async function postJson<TData, TPayload>(url: string, payload: TPayload, devFault?: "llm"): Promise<TData> {
  const response = await fetch(url, {
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

export function parseProfile(payload: {
  resumeText: string;
  jdText: string;
  interviewerStyleId: InterviewerStyleId;
  promptOverrides?: PromptOverrides;
}) {
  return postJson<CandidateProfile, typeof payload>("/api/profile/parse", payload, "llm");
}

export function generateQuestions(payload: {
  candidateProfile: CandidateProfile;
  interviewerStyleId: InterviewerStyleId;
  questionCount: 3;
  promptOverrides?: PromptOverrides;
}) {
  return postJson<{ questions: InterviewQuestion[] }, typeof payload>("/api/questions/generate", payload, "llm");
}

export function generateReport(payload: {
  candidateProfile: CandidateProfile;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  interviewerStyleId?: InterviewerStyleId;
  promptOverrides?: PromptOverrides;
}) {
  return postJson<InterviewReport, typeof payload>("/api/report/generate", payload, "llm");
}

export interface ReportStreamProgress {
  stage: string;
  message: string;
}

export interface ReportStreamHandlers {
  onProgress?: (progress: ReportStreamProgress) => void;
  onQuestionReport?: (questionReport: QuestionReport & { partial?: boolean; message?: string }) => void;
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
    body: JSON.stringify(payload)
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

  return finalReport;
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

export async function requestTtsAudio(payload: {
  text: string;
  styleId: InterviewerStyleId;
  voiceName?: string;
  rate?: number | string;
  pitch?: number | string;
  volume?: number | string;
}) {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getDevRequestHeaders("tts")
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Azure TTS 不可用，已切换到浏览器语音兜底。");
  }

  return response.blob();
}

export async function requestSttTranscript(audio: Blob) {
  const response = await fetch("/api/stt", {
    method: "POST",
    headers: {
      "Content-Type": audio.type || "audio/wav",
      ...getDevRequestHeaders("tts")
    },
    body: audio
  });

  const payload = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
  if (!response.ok || !payload?.text) {
    throw new Error(payload?.error || "Azure STT 识别失败，已保留当前文本，可重试或手动编辑。");
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
    throw new Error("Azure TTS 状态查询失败。");
  }

  return (await response.json()) as {
    configured: boolean;
    region: string;
    voices: VoiceOption[];
  };
}
