import "server-only";

import { createHmac } from "node:crypto";

import { readAuthConfig } from "@/lib/config/internalBeta";
import { getRuntimePool } from "@/lib/db/pool";

export type WriteBodyMode = "json" | "optional-json" | "none";

export interface WriteRequestSecurityOptions {
  body: WriteBodyMode;
  maxBodyBytes?: number;
  limit?: number;
  windowSeconds?: number;
}

export class WriteRequestSecurityError extends Error {
  constructor(
    public readonly code:
      | "INPUT_INVALID"
      | "RATE_LIMITED"
      | "SECURITY_DEPENDENCY_FAILED",
    public readonly status: 400 | 429 | 503,
    public readonly retryAfterSeconds?: number
  ) {
    super(code);
    this.name = "WriteRequestSecurityError";
  }
}

function requestSource(request: Request) {
  const cookie = request.headers.get("cookie")?.trim();
  if (cookie) return `cookie:${cookie}`;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return `ip:${ip}`;
}

function scopeHash(request: Request) {
  return createHmac("sha256", readAuthConfig().secret)
    .update(requestSource(request))
    .digest("hex");
}

function isJsonContentType(value: string | null) {
  if (!value) return false;
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json" || /^application\/[^/]+\+json$/.test(mediaType);
}

async function bodyFits(request: Request, maxBodyBytes: number) {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const parsed = Number(declared);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maxBodyBytes) {
      return false;
    }
  }
  if (!request.body) return true;

  const reader = request.clone().body?.getReader();
  if (!reader) return true;
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return true;
      total += chunk.value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel();
        return false;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function reserveRateLimit(
  request: Request,
  route: string,
  limit: number,
  windowSeconds: number
) {
  try {
    const result = await getRuntimePool().query<{
      allowed: boolean;
      retry_after_seconds: number;
    }>(
      `select allowed, retry_after_seconds
         from public.reserve_write_rate_limit($1, $2, $3, $4, $5)`,
      [scopeHash(request), route, request.method, limit, windowSeconds]
    );
    const reservation = result.rows[0];
    if (!reservation) throw new Error("WRITE_RATE_LIMIT_RESERVATION_FAILED");
    if (!reservation.allowed) {
      throw new WriteRequestSecurityError(
        "RATE_LIMITED",
        429,
        Number(reservation.retry_after_seconds)
      );
    }
  } catch (error) {
    if (error instanceof WriteRequestSecurityError) throw error;
    throw new WriteRequestSecurityError("SECURITY_DEPENDENCY_FAILED", 503);
  }
}

export async function enforceWriteRequestSecurity(
  request: Request,
  route: string,
  options: WriteRequestSecurityOptions
) {
  const limit = options.limit ?? 60;
  const windowSeconds = options.windowSeconds ?? 60;
  await reserveRateLimit(request, route, limit, windowSeconds);

  if (options.body === "none") return;
  const contentType = request.headers.get("content-type");
  if (
    (options.body === "json" && !isJsonContentType(contentType)) ||
    (options.body === "optional-json" && contentType !== null && !isJsonContentType(contentType))
  ) {
    throw new WriteRequestSecurityError("INPUT_INVALID", 400);
  }

  if (!(await bodyFits(request, options.maxBodyBytes ?? 4096))) {
    throw new WriteRequestSecurityError("INPUT_INVALID", 400);
  }
}
