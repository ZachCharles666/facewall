import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultPromptOverrides, normalizePromptOverrides } from "@/lib/prompts/productPromptSuite";
import type { PromptOverrides, PromptStoreSnapshot } from "@/lib/types";

const promptStoreVersion = 1;
const defaultPromptStorePath = path.join(process.cwd(), "outputs", "active-prompt-overrides.json");

function getPromptStorePath() {
  return process.env.FACEWALL_PROMPT_STORE_PATH || defaultPromptStorePath;
}

function parsePromptStore(rawValue: string): PromptStoreSnapshot {
  const parsedValue = JSON.parse(rawValue) as unknown;
  if (parsedValue && typeof parsedValue === "object" && !Array.isArray(parsedValue) && "promptOverrides" in parsedValue) {
    const storeValue = parsedValue as { promptOverrides?: unknown; updatedAt?: unknown };
    return {
      promptOverrides: normalizePromptOverrides(storeValue.promptOverrides),
      updatedAt: typeof storeValue.updatedAt === "string" ? storeValue.updatedAt : null
    };
  }

  return {
    promptOverrides: normalizePromptOverrides(parsedValue),
    updatedAt: null
  };
}

export async function readActivePromptOverrides(): Promise<PromptStoreSnapshot> {
  try {
    const rawValue = await readFile(getPromptStorePath(), "utf8");
    return parsePromptStore(rawValue);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        promptOverrides: defaultPromptOverrides,
        updatedAt: null
      };
    }
    throw error;
  }
}

export async function saveActivePromptOverrides(value: unknown): Promise<PromptStoreSnapshot> {
  const promptOverrides = normalizePromptOverrides(value);
  const updatedAt = new Date().toISOString();
  const targetPath = getPromptStorePath();
  const targetDir = path.dirname(targetPath);
  const tempPath = path.join(targetDir, `.active-prompt-overrides.${process.pid}.${Date.now()}.tmp`);
  const filePayload = {
    version: promptStoreVersion,
    updatedAt,
    promptOverrides
  };

  await mkdir(targetDir, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(filePayload, null, 2)}\n`, "utf8");
  await rename(tempPath, targetPath);

  return {
    promptOverrides,
    updatedAt
  };
}

export async function resolvePromptOverrides(payload: unknown): Promise<PromptOverrides> {
  const promptOverrides =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { promptOverrides?: unknown }).promptOverrides
      : undefined;

  if (promptOverrides) {
    return normalizePromptOverrides(promptOverrides);
  }

  const snapshot = await readActivePromptOverrides();
  return snapshot.promptOverrides;
}
