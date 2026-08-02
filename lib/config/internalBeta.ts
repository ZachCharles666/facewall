const DATABASE_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const TENCENT_SES_REGIONS = new Set(["ap-guangzhou", "ap-hongkong"]);
type EnvSource = Record<string, string | undefined>;

export class InternalBetaConfigError extends Error {
  constructor(public readonly variable: string) {
    super(`INTERNAL_BETA_CONFIG_INVALID: ${variable}`);
    this.name = "InternalBetaConfigError";
  }
}

function required(name: string, env: EnvSource) {
  const value = env[name]?.trim();
  if (!value) throw new InternalBetaConfigError(name);
  return value;
}

function databaseUrl(name: string, env: EnvSource) {
  const value = required(name, env);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new InternalBetaConfigError(name);
  }
  if (!DATABASE_PROTOCOLS.has(parsed.protocol) || !parsed.hostname || !parsed.pathname.slice(1)) {
    throw new InternalBetaConfigError(name);
  }
  return value;
}

export interface DatabaseConfig {
  runtimeUrl: string;
  adminUrl: string;
}

export interface AuthConfig {
  secret: string;
  baseUrl: string;
}

export interface TencentSesConfig {
  secretId: string;
  secretKey: string;
  region: string;
  fromEmail: string;
  templateId: number;
}

export interface OtpBudgetConfig {
  emailDailyLimit: number;
  ipDailyLimit: number;
  globalWarnLimit: number;
  globalStopLimit: number;
}

export type InterviewPersistenceMode = "off" | "mirror" | "source";

function positiveInteger(name: string, env: EnvSource, fallback: number) {
  const raw = env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InternalBetaConfigError(name);
  }
  return value;
}

export function readDatabaseConfig(env: EnvSource = process.env): DatabaseConfig {
  return {
    runtimeUrl: databaseUrl("DATABASE_URL", env),
    adminUrl: databaseUrl("DATABASE_ADMIN_URL", env)
  };
}

export function readAuthConfig(env: EnvSource = process.env): AuthConfig {
  const secret = required("BETTER_AUTH_SECRET", env);
  if (secret.length < 32) throw new InternalBetaConfigError("BETTER_AUTH_SECRET");

  const baseUrl = required("BETTER_AUTH_URL", env);
  try {
    const parsed = new URL(baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new InternalBetaConfigError("BETTER_AUTH_URL");
  }

  return { secret, baseUrl };
}

export function isInternalBetaAuthEnabled(env: EnvSource = process.env) {
  const value = env.INTERNAL_BETA_AUTH_ENABLED?.trim().toLowerCase();
  if (!value) return env.NODE_ENV !== "production";
  if (value === "true") return true;
  if (value === "false") return false;
  throw new InternalBetaConfigError("INTERNAL_BETA_AUTH_ENABLED");
}

export function readInterviewPersistenceMode(env: EnvSource = process.env): InterviewPersistenceMode {
  const value = env.INTERNAL_BETA_PERSISTENCE_MODE?.trim().toLowerCase();
  if (!value) return isInternalBetaAuthEnabled(env) ? "source" : "off";
  if (value === "off" || value === "mirror" || value === "source") return value;
  throw new InternalBetaConfigError("INTERNAL_BETA_PERSISTENCE_MODE");
}

export function isConsentGateEnabled(env: EnvSource = process.env) {
  const value = env.INTERNAL_BETA_REQUIRE_CONSENT?.trim().toLowerCase();
  if (!value) return isInternalBetaAuthEnabled(env);
  if (value === "false") return false;
  if (value === "true") return true;
  throw new InternalBetaConfigError("INTERNAL_BETA_REQUIRE_CONSENT");
}

export function readOtpExpiresInSec(env: EnvSource = process.env) {
  const value = positiveInteger("AUTH_OTP_EXPIRES_IN_SEC", env, 1800);
  if (value < 300 || value > 1800) {
    throw new InternalBetaConfigError("AUTH_OTP_EXPIRES_IN_SEC");
  }
  return value;
}

export function isLocalDevOtpEnabled(env: EnvSource = process.env) {
  if (env.NODE_ENV === "production") return false;
  return env.INTERNAL_BETA_LOCAL_OTP_ENABLED?.trim().toLowerCase() === "true";
}

export function readLocalDevOtpCode(env: EnvSource = process.env) {
  const code = env.INTERNAL_BETA_LOCAL_OTP_CODE?.trim() || "999999";
  if (!/^\d{6}$/.test(code)) {
    throw new InternalBetaConfigError("INTERNAL_BETA_LOCAL_OTP_CODE");
  }
  return code;
}

export function readTencentSesConfig(env: EnvSource = process.env): TencentSesConfig {
  const region = required("TENCENT_SES_REGION", env);
  if (!TENCENT_SES_REGIONS.has(region)) {
    throw new InternalBetaConfigError("TENCENT_SES_REGION");
  }

  const fromEmail = required("TENCENT_SES_FROM_EMAIL", env);
  const addressMatch = fromEmail.match(/^(?:[^:<>]+\s+<)?([^<>\s]+@[^<>\s]+)>?$/);
  if (!addressMatch) {
    throw new InternalBetaConfigError("TENCENT_SES_FROM_EMAIL");
  }

  const templateIdValue = required("TENCENT_SES_TEMPLATE_ID", env);
  const templateId = Number(templateIdValue);
  if (!Number.isSafeInteger(templateId) || templateId <= 0) {
    throw new InternalBetaConfigError("TENCENT_SES_TEMPLATE_ID");
  }

  return {
    secretId: required("TENCENTCLOUD_SECRET_ID", env),
    secretKey: required("TENCENTCLOUD_SECRET_KEY", env),
    region,
    fromEmail,
    templateId
  };
}

export function readOtpBudgetConfig(env: EnvSource = process.env): OtpBudgetConfig {
  const config = {
    emailDailyLimit: positiveInteger("AUTH_OTP_EMAIL_DAILY_LIMIT", env, 5),
    ipDailyLimit: positiveInteger("AUTH_OTP_IP_DAILY_LIMIT", env, 20),
    globalWarnLimit: positiveInteger("AUTH_OTP_GLOBAL_WARN_LIMIT", env, 400),
    globalStopLimit: positiveInteger("AUTH_OTP_GLOBAL_STOP_LIMIT", env, 450)
  };
  if (config.globalWarnLimit >= config.globalStopLimit) {
    throw new InternalBetaConfigError("AUTH_OTP_GLOBAL_WARN_LIMIT");
  }
  return config;
}
