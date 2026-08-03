import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizePersonaSpeechTunings } from "@/lib/speech/settings";
import type { SpeechSettingsSnapshot, TtsEngine } from "@/lib/types";

const speechSettingsStoreVersion = 1;
const defaultSpeechSettingsStorePath = path.join(process.cwd(), "outputs", "active-speech-settings.json");

function getSpeechSettingsStorePath() {
  return process.env.FACEWALL_SPEECH_SETTINGS_PATH || defaultSpeechSettingsStorePath;
}

function normalizeTtsEngine(value: unknown): TtsEngine | null {
  return value === "tencent" || value === "azure" || value === "web" ? value : null;
}

function parseSpeechSettingsStore(rawValue: string): SpeechSettingsSnapshot {
  const parsedValue = JSON.parse(rawValue) as unknown;
  if (parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue) && "speechTunings" in parsedValue) {
    const storeValue = parsedValue as {
      speechTunings?: unknown;
      ttsEngine?: unknown;
      updatedAt?: unknown;
    };
    return {
      speechTunings: normalizePersonaSpeechTunings(storeValue.speechTunings),
      ttsEngine: normalizeTtsEngine(storeValue.ttsEngine),
      updatedAt: typeof storeValue.updatedAt === "string" ? storeValue.updatedAt : null
    };
  }

  return {
    speechTunings: normalizePersonaSpeechTunings(parsedValue),
    ttsEngine: null,
    updatedAt: null
  };
}

export async function readActiveSpeechSettings(): Promise<SpeechSettingsSnapshot> {
  try {
    const rawValue = await readFile(getSpeechSettingsStorePath(), "utf8");
    return parseSpeechSettingsStore(rawValue);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        speechTunings: normalizePersonaSpeechTunings(null),
        ttsEngine: null,
        updatedAt: null
      };
    }
    throw error;
  }
}

export async function saveActiveSpeechSettings(
  value: unknown,
  ttsEngineValue?: unknown
): Promise<SpeechSettingsSnapshot> {
  const speechTunings = normalizePersonaSpeechTunings(value);
  const ttsEngine = normalizeTtsEngine(ttsEngineValue);
  const updatedAt = new Date().toISOString();
  const targetPath = getSpeechSettingsStorePath();
  const targetDir = path.dirname(targetPath);
  const tempPath = path.join(targetDir, `.active-speech-settings.${process.pid}.${Date.now()}.tmp`);
  const filePayload = {
    version: speechSettingsStoreVersion,
    updatedAt,
    speechTunings,
    ttsEngine
  };

  await mkdir(targetDir, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(filePayload, null, 2)}\n`, "utf8");
  await rename(tempPath, targetPath);

  return {
    speechTunings,
    ttsEngine,
    updatedAt
  };
}
