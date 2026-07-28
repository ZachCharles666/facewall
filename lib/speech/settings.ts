import type { InterviewerStyleId, PersonaSpeechTunings, SpeechTuning, VoiceOption } from "@/lib/types";

export const interviewerSpeechLabels: Record<InterviewerStyleId, string> = {
  strictHr: "温婉HR小姐姐",
  techBro: "技术老哥",
  gentleSister: "资深业务大佬"
};

export const interviewerSpeechStyleIds: InterviewerStyleId[] = ["strictHr", "techBro", "gentleSister"];

export const azureVoiceOptions: VoiceOption[] = [
  { value: "auto", label: "按人设自动选择" },
  { value: "zh-CN-XiaoxiaoNeural", label: "Xiaoxiao 女声，清晰自然" },
  { value: "zh-CN-XiaoyiNeural", label: "Xiaoyi 女声，年轻友好" },
  { value: "zh-CN-YunxiNeural", label: "Yunxi 男声，年轻自然" },
  { value: "zh-CN-YunyangNeural", label: "Yunyang 男声，播报感" },
  { value: "zh-CN-YunjianNeural", label: "Yunjian 男声，成熟稳重" },
  { value: "zh-CN-YunhaoNeural", label: "Yunhao 男声，深沉有力" }
];

export const personaVoices: Record<InterviewerStyleId, string> = {
  strictHr: "zh-CN-XiaoxiaoNeural",
  techBro: "zh-CN-YunxiNeural",
  gentleSister: "zh-CN-XiaoyiNeural"
};

export const personaSpeechDefaults: Record<InterviewerStyleId, SpeechTuning> = {
  strictHr: {
    voiceName: "auto",
    rate: 1.12,
    pitch: 0.82,
    volume: 1
  },
  techBro: {
    voiceName: "auto",
    rate: 1.02,
    pitch: 0.72,
    volume: 1
  },
  gentleSister: {
    voiceName: "auto",
    rate: 0.94,
    pitch: 1.14,
    volume: 1
  }
};

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(min, Math.min(max, numericValue));
}

export function normalizeSpeechTuning(value: unknown, fallback: SpeechTuning): SpeechTuning {
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<SpeechTuning>) : {};
  return {
    voiceName: typeof candidate.voiceName === "string" && candidate.voiceName.trim() ? candidate.voiceName : fallback.voiceName,
    rate: clampNumber(candidate.rate, fallback.rate, 0.6, 1.5),
    pitch: clampNumber(candidate.pitch, fallback.pitch, 0.1, 1.5),
    volume: clampNumber(candidate.volume, fallback.volume, 0, 1)
  };
}

export function normalizePersonaSpeechTunings(value: unknown): PersonaSpeechTunings {
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<PersonaSpeechTunings>) : {};
  return interviewerSpeechStyleIds.reduce<PersonaSpeechTunings>(
    (result, styleId) => ({
      ...result,
      [styleId]: normalizeSpeechTuning(candidate[styleId], personaSpeechDefaults[styleId])
    }),
    { ...personaSpeechDefaults }
  );
}

export function toAzureRate(value: number | string | undefined) {
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "0%";
  const percent = Math.round(((value as number) - 1) * 100);
  const clamped = Math.max(-45, Math.min(45, percent));
  return `${clamped >= 0 ? "+" : ""}${clamped}%`;
}

export function toAzurePitch(value: number | string | undefined) {
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "0Hz";
  const hz = Math.round(((value as number) - 1) * 40);
  const clamped = Math.max(-50, Math.min(50, hz));
  return `${clamped >= 0 ? "+" : ""}${clamped}Hz`;
}

export function toAzureVolume(value: number | string | undefined) {
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "medium";
  if ((value as number) <= 0.35) return "x-soft";
  if ((value as number) <= 0.7) return "soft";
  return "medium";
}
