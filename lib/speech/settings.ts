import type { InterviewerStyleId, SpeechTuning, VoiceOption } from "@/lib/types";

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
