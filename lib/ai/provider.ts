export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmJsonResult {
  json: unknown;
  rawText: string;
}

export class LlmUnavailableError extends Error {
  constructor(message = "LLM provider is not configured.") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export class LlmProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmProviderError";
  }
}

export function getLlmErrorCode(error: unknown) {
  if (error instanceof Error && error.message.includes("LLM_SCHEMA_INVALID")) {
    return "LLM_SCHEMA_INVALID";
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "LLM_TIMEOUT";
  }
  return "LLM_PROVIDER_FAILED";
}

export function isLlmConfigured() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.LLM_API_KEY);
}

export async function generateJsonWithRetry(messages: LlmMessage[], options?: { signal?: AbortSignal }) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await generateJson(messages, options);
    } catch (error) {
      lastError = error;
      if (error instanceof LlmUnavailableError) break;
    }
  }
  throw lastError instanceof Error ? lastError : new LlmProviderError("LLM request failed.");
}

async function generateJson(messages: LlmMessage[], options?: { signal?: AbortSignal }): Promise<LlmJsonResult> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new LlmUnavailableError();
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || process.env.LLM_MODEL || "gpt-4o-mini";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      response_format: { type: "json_object" }
    }),
    signal: options?.signal
  });

  if (!response.ok) {
    throw new LlmProviderError(`LLM request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const rawText = payload.choices?.[0]?.message?.content;
  if (!rawText) {
    throw new LlmProviderError("LLM response did not include content.");
  }

  try {
    return {
      json: JSON.parse(rawText),
      rawText
    };
  } catch {
    throw new LlmProviderError("LLM response was not valid JSON.");
  }
}

export function createTimeoutSignal(timeoutMs = 25000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}
