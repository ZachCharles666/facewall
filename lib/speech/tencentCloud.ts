import "server-only";

import { asr, tts } from "tencentcloud-sdk-nodejs";

type TencentSpeechConfig = {
  secretId: string;
  secretKey: string;
  region: string;
  voiceType: number;
  asrEngine: string;
};

function configuredValue(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized && !/^replace_|^your_/i.test(normalized) ? normalized : null;
}

export function readTencentSpeechConfig(): TencentSpeechConfig | null {
  const secretId = configuredValue(process.env.TENCENT_SPEECH_SECRET_ID);
  const secretKey = configuredValue(process.env.TENCENT_SPEECH_SECRET_KEY);
  if (!secretId || !secretKey) return null;

  const parsedVoiceType = Number(process.env.TENCENT_TTS_VOICE_TYPE ?? "101001");
  return {
    secretId,
    secretKey,
    region: process.env.TENCENT_SPEECH_REGION?.trim() || "ap-shanghai",
    voiceType: Number.isInteger(parsedVoiceType) && parsedVoiceType >= 0
      ? parsedVoiceType
      : 101001,
    asrEngine: process.env.TENCENT_ASR_ENGINE?.trim() || "16k_zh"
  };
}

function clientConfig(config: TencentSpeechConfig, requestTimeoutSec = 30) {
  return {
    credential: {
      secretId: config.secretId,
      secretKey: config.secretKey
    },
    region: config.region,
    profile: {
      httpProfile: {
        reqMethod: "POST" as const,
        reqTimeout: requestTimeoutSec
      }
    }
  };
}

function toTencentSpeed(rate: number | string | undefined) {
  const parsed = typeof rate === "number" ? rate : Number(rate);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-2, Math.min(6, Number(((parsed - 1) / 0.2).toFixed(2))));
}

export async function synthesizeWithTencent(input: {
  text: string;
  rate?: number | string;
}) {
  const config = readTencentSpeechConfig();
  if (!config) throw new Error("TENCENT_SPEECH_NOT_CONFIGURED");
  const Client = tts.v20190823.Client;
  const client = new Client(clientConfig(config, 6));
  const response = await client.TextToVoice({
    Text: input.text,
    SessionId: crypto.randomUUID(),
    VoiceType: config.voiceType,
    PrimaryLanguage: 1,
    SampleRate: 16000,
    Codec: "mp3",
    Speed: toTencentSpeed(input.rate)
  });
  if (!response.Audio) throw new Error("TENCENT_TTS_EMPTY_AUDIO");
  return Buffer.from(response.Audio, "base64");
}

function voiceFormatFromContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("ogg")) return "ogg-opus";
  if (normalized.includes("m4a")) return "m4a";
  if (normalized.includes("aac")) return "aac";
  return "wav";
}

export async function recognizeWithTencent(input: {
  audio: Buffer;
  contentType: string;
}) {
  const config = readTencentSpeechConfig();
  if (!config) throw new Error("TENCENT_SPEECH_NOT_CONFIGURED");
  const Client = asr.v20190614.Client;
  const client = new Client(clientConfig(config));
  const response = await client.SentenceRecognition({
    EngSerViceType: config.asrEngine,
    SourceType: 1,
    VoiceFormat: voiceFormatFromContentType(input.contentType),
    Data: input.audio.toString("base64"),
    DataLen: input.audio.byteLength,
    WordInfo: 0,
    FilterDirty: 0,
    FilterModal: 0,
    FilterPunc: 0,
    ConvertNumMode: 1
  });
  const text = response.Result?.trim();
  if (!text) throw new Error("TENCENT_ASR_EMPTY_TEXT");
  return text;
}
