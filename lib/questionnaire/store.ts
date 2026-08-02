import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  defaultQuestionnaireConfig,
  normalizeQuestionnaireConfig,
  type QuestionnaireConfig
} from "@/lib/questionnaire/schema";

const defaultStorePath = path.join(
  process.cwd(),
  "outputs",
  "active-questionnaire-config.json"
);

function storePath() {
  return process.env.FACEWALL_QUESTIONNAIRE_STORE_PATH || defaultStorePath;
}
export function isQuestionnaireConfigWriteEnabled(
  env: Record<string, string | undefined> = process.env
) {
  const value = env.QUESTIONNAIRE_CONFIG_WRITE_ENABLED?.trim().toLowerCase();
  if (!value) return env.NODE_ENV !== "production";
  return value === "true";
}

export async function readQuestionnaireConfig(): Promise<QuestionnaireConfig> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as { config?: unknown } | unknown;
    const config =
      parsed && typeof parsed === "object" && !Array.isArray(parsed) && "config" in parsed
        ? (parsed as { config?: unknown }).config
        : parsed;
    return normalizeQuestionnaireConfig(config);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return defaultQuestionnaireConfig;
    }
    throw error;
  }
}

export async function saveQuestionnaireConfig(value: unknown) {
  const normalized = normalizeQuestionnaireConfig(value);
  const config: QuestionnaireConfig = {
    ...normalized,
    version: `questionnaire-${new Date().toISOString()}`
  };
  const target = storePath();
  const directory = path.dirname(target);
  const temporary = path.join(
    directory,
    `.active-questionnaire.${process.pid}.${Date.now()}.tmp`
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    temporary,
    `${JSON.stringify({ schemaVersion: 1, config }, null, 2)}\n`,
    "utf8"
  );
  await rename(temporary, target);
  return config;
}
