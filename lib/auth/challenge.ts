import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from "node:crypto";

const CHALLENGE_VERSION = "v1";
const DEFAULT_CHALLENGE_TTL_SEC = 30 * 60;

interface ChallengePayload {
  email: string;
  expiresAt: number;
  nonce: string;
}

function keyFromSecret(secret: string) {
  if (secret.length < 32) throw new Error("AUTH_CHALLENGE_SECRET_INVALID");
  return createHash("sha256").update(secret, "utf8").digest();
}

export function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("INPUT_INVALID");
  }
  return normalized;
}

export function hashInviteCode(inviteCode: string, secret: string) {
  const normalized = inviteCode.trim().toUpperCase();
  if (normalized.length < 4 || normalized.length > 128) {
    throw new Error("INPUT_INVALID");
  }
  return createHmac("sha256", keyFromSecret(secret)).update(normalized, "utf8").digest("hex");
}

export function hashOtpRateKey(kind: "email" | "ip", value: string, secret: string) {
  const normalized = kind === "email" ? normalizeEmail(value) : value.trim().slice(0, 256);
  if (!normalized) throw new Error("INPUT_INVALID");
  return createHmac("sha256", keyFromSecret(secret))
    .update(`${kind}:${normalized}`, "utf8")
    .digest("hex");
}

export function createAuthChallenge(
  email: string,
  secret: string,
  nowMs = Date.now(),
  ttlSec = DEFAULT_CHALLENGE_TTL_SEC
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const payload: ChallengePayload = {
    email: normalizeEmail(email),
    expiresAt: Math.floor(nowMs / 1000) + ttlSec,
    nonce: randomBytes(16).toString("base64url")
  };
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  return [
    CHALLENGE_VERSION,
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url")
  ].join(".");
}

export function readAuthChallenge(
  challengeId: string,
  expectedEmail: string,
  secret: string,
  nowMs = Date.now()
) {
  const [version, ivValue, encryptedValue, tagValue, extra] = challengeId.split(".");
  if (
    version !== CHALLENGE_VERSION ||
    !ivValue ||
    !encryptedValue ||
    !tagValue ||
    extra
  ) {
    throw new Error("AUTH_CHALLENGE_INVALID");
  }

  try {
    const iv = Buffer.from(ivValue, "base64url");
    const encrypted = Buffer.from(encryptedValue, "base64url");
    const tag = Buffer.from(tagValue, "base64url");
    if (
      iv.toString("base64url") !== ivValue ||
      encrypted.toString("base64url") !== encryptedValue ||
      tag.toString("base64url") !== tagValue
    ) {
      throw new Error("AUTH_CHALLENGE_INVALID");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFromSecret(secret),
      iv
    );
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]).toString("utf8");
    const payload = JSON.parse(plaintext) as ChallengePayload;
    if (
      payload.email !== normalizeEmail(expectedEmail) ||
      !payload.nonce
    ) {
      throw new Error("AUTH_CHALLENGE_INVALID");
    }
    if (payload.expiresAt <= Math.floor(nowMs / 1000)) {
      throw new Error("AUTH_CHALLENGE_EXPIRED");
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_CHALLENGE_EXPIRED") throw error;
    throw new Error("AUTH_CHALLENGE_INVALID");
  }
}
