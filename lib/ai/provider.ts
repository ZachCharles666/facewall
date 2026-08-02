export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmJsonResult {
  json: unknown;
  rawText: string;
  provider: string;
  model: string;
  latencyMs: number;
  attempts: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
}

export class LlmUnavailableError extends Error {
  constructor(message = "LLM provider is not configured.") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export class LlmProviderError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "LlmProviderError";
    this.status = status;
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
  return Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.LLM_API_KEY ||
      process.env.NVIDIA_API_KEY
  );
}

export function getLlmProviderDescriptor() {
  const usingNvidiaDefaults = Boolean(
    process.env.NVIDIA_API_KEY &&
      !process.env.OPENAI_API_KEY &&
      !process.env.LLM_API_KEY
  );
  const baseUrl =
    process.env.OPENAI_BASE_URL ||
    process.env.OPENAI_API_BASE ||
    (usingNvidiaDefaults
      ? "https://integrate.api.nvidia.com/v1"
      : "https://api.openai.com/v1");
  const model =
    process.env.OPENAI_MODEL ||
    process.env.LLM_MODEL ||
    (usingNvidiaDefaults ? "deepseek-ai/deepseek-v4-flash" : "gpt-4o-mini");
  let provider = "invalid-base-url";
  try {
    provider = new URL(baseUrl).host.toLowerCase();
  } catch {}
  return { baseUrl: baseUrl.replace(/\/$/, ""), provider, model };
}

export async function generateJsonWithRetry(
  messages: LlmMessage[],
  options?: { signal?: AbortSignal; maxAttempts?: 1 | 2; maxTokens?: number }
) {
  let lastError: unknown;
  const maxAttempts = options?.maxAttempts === 1 ? 1 : 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await generateJson(messages, options);
      return { ...result, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (error instanceof LlmUnavailableError) break;
      if (!isRetryableProviderError(error) || attempt + 1 >= maxAttempts) break;
      await waitForRetry(700 * (attempt + 1), options?.signal);
    }
  }
  throw lastError instanceof Error ? lastError : new LlmProviderError("LLM request failed.");
}

async function generateJson(
  messages: LlmMessage[],
  options?: { signal?: AbortSignal; maxTokens?: number }
): Promise<LlmJsonResult> {
  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.LLM_API_KEY ||
    process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new LlmUnavailableError();
  }

  const { baseUrl, provider, model } = getLlmProviderDescriptor();
  const startedAt = performance.now();
  const isNvidiaDeepSeek = provider === "integrate.api.nvidia.com" && model.startsWith("deepseek-ai/");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.25,
      response_format: { type: "json_object" },
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
      ...(isNvidiaDeepSeek ? { chat_template_kwargs: { thinking: false } } : {})
    }),
    signal: options?.signal
  });

  if (!response.ok) {
    throw new LlmProviderError(`LLM request failed with status ${response.status}.`, response.status);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };
  const rawText = payload.choices?.[0]?.message?.content;
  if (!rawText) {
    throw new LlmProviderError("LLM response did not include content.");
  }

  try {
    return {
      json: JSON.parse(rawText),
      rawText,
      provider,
      model,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      attempts: 1,
      usage: {
        inputTokens: Number.isFinite(payload.usage?.prompt_tokens)
          ? Number(payload.usage?.prompt_tokens)
          : null,
        outputTokens: Number.isFinite(payload.usage?.completion_tokens)
          ? Number(payload.usage?.completion_tokens)
          : null
      }
    };
  } catch {
    throw new LlmProviderError("LLM response was not valid JSON.");
  }
}

export function createTimeoutSignal(timeoutMs = 25000, parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
    }
  };
}

function isRetryableProviderError(error: unknown) {
  if (error instanceof LlmProviderError && error.status !== null) {
    return error.status === 429 || error.status >= 500;
  }
  return error instanceof TypeError;
}

function waitForRetry(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
