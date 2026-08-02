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

interface LlmProviderCandidate {
  apiKey: string;
  baseUrl: string;
  provider: string;
  model: string;
  disableThinking: boolean;
}

const TOKENHUB_BASE_URL = "https://tokenhub.tencentmaas.com/v1";
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS = 8_000;

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
  return getConfiguredLlmProviders().length > 0;
}

export function getLlmProviderDescriptor() {
  const primary = getConfiguredLlmProviders()[0];
  return primary
    ? { provider: primary.provider, model: primary.model }
    : { provider: "not-configured", model: "not-configured" };
}

export function getLlmProviderChainDescriptors() {
  return getConfiguredLlmProviders().map(({ provider, model }) => ({ provider, model }));
}

export async function generateJsonWithRetry(
  messages: LlmMessage[],
  options?: {
    signal?: AbortSignal;
    maxAttempts?: 1 | 2;
    maxTokens?: number;
    attemptTimeoutMs?: number;
  }
) {
  const candidates = getConfiguredLlmProviders();
  if (candidates.length === 0) {
    throw new LlmUnavailableError();
  }

  // The staging attempt guard must remain a literal single outbound request.
  // Normal traffic tries each configured provider once in the declared order.
  const attemptCandidates =
    options?.maxAttempts === 1
      ? candidates.slice(0, 1)
      : candidates.length === 1
        ? [candidates[0], candidates[0]]
        : candidates;
  const startedAt = performance.now();
  let lastError: unknown;

  for (let index = 0; index < attemptCandidates.length; index += 1) {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const attemptTimeout = createTimeoutSignal(
      normalizeAttemptTimeout(options?.attemptTimeoutMs),
      options?.signal
    );
    try {
      const result = await generateJson(attemptCandidates[index], messages, {
        signal: attemptTimeout.signal,
        maxTokens: options?.maxTokens
      });
      return {
        ...result,
        attempts: index + 1,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt))
      };
    } catch (error) {
      lastError = error;
      if (options?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (!isRetryableProviderError(error) || index + 1 >= attemptCandidates.length) {
        break;
      }
    } finally {
      attemptTimeout.clear();
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new LlmProviderError("LLM request failed.");
}

async function generateJson(
  candidate: LlmProviderCandidate,
  messages: LlmMessage[],
  options?: { signal?: AbortSignal; maxTokens?: number }
): Promise<LlmJsonResult> {
  const startedAt = performance.now();
  const response = await fetch(`${candidate.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${candidate.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: candidate.model,
      messages,
      temperature: 0.25,
      response_format: { type: "json_object" },
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
      ...(candidate.disableThinking
        ? { chat_template_kwargs: { thinking: false } }
        : {})
    }),
    signal: options?.signal
  });

  if (!response.ok) {
    throw new LlmProviderError(
      `LLM request failed with status ${response.status}.`,
      response.status
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const rawText = payload.choices?.[0]?.message?.content;
  if (!rawText) {
    throw new LlmProviderError("LLM response did not include content.");
  }

  try {
    return {
      json: JSON.parse(rawText),
      rawText,
      provider: candidate.provider,
      model: candidate.model,
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

function getConfiguredLlmProviders(): LlmProviderCandidate[] {
  const tokenHubKey = normalizeSecret(process.env.TOKENHUB_API_KEY);
  const nvidiaKey = normalizeSecret(process.env.NVIDIA_API_KEY);
  const candidates: LlmProviderCandidate[] = [];

  if (tokenHubKey) {
    const baseUrl = normalizeBaseUrl(
      process.env.TOKENHUB_BASE_URL,
      TOKENHUB_BASE_URL
    );
    candidates.push(
      makeCandidate(tokenHubKey, baseUrl, process.env.TOKENHUB_HY3_MODEL || "hy3"),
      makeCandidate(
        tokenHubKey,
        baseUrl,
        process.env.TOKENHUB_DEEPSEEK_MODEL || "deepseek-v4-flash"
      ),
      makeCandidate(
        tokenHubKey,
        baseUrl,
        process.env.TOKENHUB_KIMI_MODEL || "kimi-k3"
      )
    );
  } else {
    const legacyKey = normalizeSecret(
      process.env.OPENAI_API_KEY || process.env.LLM_API_KEY
    );
    if (legacyKey) {
      candidates.push(
        makeCandidate(
          legacyKey,
          normalizeBaseUrl(
            process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE,
            "https://api.openai.com/v1"
          ),
          process.env.OPENAI_MODEL || process.env.LLM_MODEL || "gpt-4o-mini"
        )
      );
    }
  }

  if (nvidiaKey) {
    candidates.push(
      makeCandidate(
        nvidiaKey,
        normalizeBaseUrl(process.env.NVIDIA_BASE_URL, NVIDIA_BASE_URL),
        process.env.NVIDIA_MODEL || "deepseek-ai/deepseek-v4-flash",
        true
      )
    );
  }

  return candidates;
}

function makeCandidate(
  apiKey: string,
  baseUrl: string,
  model: string,
  disableThinking = false
): LlmProviderCandidate {
  let provider = "invalid-base-url";
  try {
    provider = new URL(baseUrl).host.toLowerCase();
  } catch {}
  return { apiKey, baseUrl, provider, model, disableThinking };
}

function normalizeSecret(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized.startsWith("replace_with_")) return null;
  return normalized;
}

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  return (value?.trim() || fallback).replace(/\/$/, "");
}

function normalizeAttemptTimeout(value: number | undefined) {
  const fromEnv = Number(process.env.LLM_PROVIDER_ATTEMPT_TIMEOUT_MS);
  const requested = value ?? fromEnv;
  return Number.isFinite(requested) && requested >= 1_000 && requested <= 30_000
    ? Math.round(requested)
    : DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS;
}

export function createTimeoutSignal(timeoutMs = 25_000, parentSignal?: AbortSignal) {
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
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }
  return error instanceof TypeError;
}
