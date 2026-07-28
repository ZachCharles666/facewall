import assert from "node:assert/strict";
import test from "node:test";

import {
  InternalBetaConfigError,
  isConsentGateEnabled,
  isInternalBetaAuthEnabled,
  readAuthConfig,
  readDatabaseConfig,
  readOtpExpiresInSec,
  readOtpBudgetConfig,
  readInterviewPersistenceMode,
  readTencentSesConfig
} from "../../lib/config/internalBeta";

test("database config rejects missing values without echoing secrets", () => {
  assert.throws(
    () => readDatabaseConfig({}),
    (error) =>
      error instanceof InternalBetaConfigError &&
      error.message === "INTERNAL_BETA_CONFIG_INVALID: DATABASE_URL"
  );
});

test("interview persistence and consent gates follow internal-beta auth by default", () => {
  assert.equal(
    readInterviewPersistenceMode({ INTERNAL_BETA_AUTH_ENABLED: "false" }),
    "off"
  );
  assert.equal(
    readInterviewPersistenceMode({ INTERNAL_BETA_AUTH_ENABLED: "true" }),
    "source"
  );
  assert.equal(
    readInterviewPersistenceMode({
      INTERNAL_BETA_AUTH_ENABLED: "true",
      INTERNAL_BETA_PERSISTENCE_MODE: "mirror"
    }),
    "mirror"
  );
  assert.equal(
    isConsentGateEnabled({ INTERNAL_BETA_AUTH_ENABLED: "false" }),
    false
  );
  assert.equal(
    isConsentGateEnabled({ INTERNAL_BETA_AUTH_ENABLED: "true" }),
    true
  );
  assert.equal(
    isConsentGateEnabled({ INTERNAL_BETA_REQUIRE_CONSENT: "true" }),
    true
  );
  assert.throws(() =>
    readInterviewPersistenceMode({
      INTERNAL_BETA_PERSISTENCE_MODE: "invalid"
    })
  );
});

test("auth config validates secret length and base URL", () => {
  assert.throws(
    () =>
      readAuthConfig({
        BETTER_AUTH_SECRET: "short",
        BETTER_AUTH_URL: "http://localhost:3000"
      }),
    /BETTER_AUTH_SECRET/
  );

  assert.deepEqual(
    readAuthConfig({
      BETTER_AUTH_SECRET: "a".repeat(32),
      BETTER_AUTH_URL: "https://beta.example.test"
    }),
    {
      secret: "a".repeat(32),
      baseUrl: "https://beta.example.test"
    }
  );
});

test("Tencent SES config validates values without echoing credentials", () => {
  assert.throws(
    () =>
      readTencentSesConfig({
        TENCENTCLOUD_SECRET_ID: "secret-id-value",
        TENCENTCLOUD_SECRET_KEY: "secret-key-value",
        TENCENT_SES_REGION: "ap-shanghai",
        TENCENT_SES_FROM_EMAIL: "PassBuddy <no-reply@example.com>",
        TENCENT_SES_TEMPLATE_ID: "123"
      }),
    (error) =>
      error instanceof InternalBetaConfigError &&
      error.message === "INTERNAL_BETA_CONFIG_INVALID: TENCENT_SES_REGION" &&
      !error.message.includes("secret-id-value") &&
      !error.message.includes("secret-key-value")
  );

  assert.deepEqual(
    readTencentSesConfig({
      TENCENTCLOUD_SECRET_ID: "secret-id-value",
      TENCENTCLOUD_SECRET_KEY: "secret-key-value",
      TENCENT_SES_REGION: "ap-guangzhou",
      TENCENT_SES_FROM_EMAIL: "PassBuddy <no-reply@example.com>",
      TENCENT_SES_TEMPLATE_ID: "123"
    }),
    {
      secretId: "secret-id-value",
      secretKey: "secret-key-value",
      region: "ap-guangzhou",
      fromEmail: "PassBuddy <no-reply@example.com>",
      templateId: 123
    }
  );
});

test("OTP budget config keeps warning below stop and accepts environment overrides", () => {
  assert.deepEqual(
    readOtpBudgetConfig({
      AUTH_OTP_EMAIL_DAILY_LIMIT: "3",
      AUTH_OTP_IP_DAILY_LIMIT: "12",
      AUTH_OTP_GLOBAL_WARN_LIMIT: "80",
      AUTH_OTP_GLOBAL_STOP_LIMIT: "90"
    }),
    {
      emailDailyLimit: 3,
      ipDailyLimit: 12,
      globalWarnLimit: 80,
      globalStopLimit: 90
    }
  );
  assert.throws(
    () =>
      readOtpBudgetConfig({
        AUTH_OTP_GLOBAL_WARN_LIMIT: "100",
        AUTH_OTP_GLOBAL_STOP_LIMIT: "100"
      }),
    (error: unknown) =>
      error instanceof InternalBetaConfigError &&
      error.variable === "AUTH_OTP_GLOBAL_WARN_LIMIT"
  );
});

test("auth feature flag is fail-closed in production and OTP expiry is bounded", () => {
  assert.equal(isInternalBetaAuthEnabled({ NODE_ENV: "production" }), false);
  assert.equal(
    isInternalBetaAuthEnabled({
      NODE_ENV: "production",
      INTERNAL_BETA_AUTH_ENABLED: "true"
    }),
    true
  );
  assert.equal(readOtpExpiresInSec({ AUTH_OTP_EXPIRES_IN_SEC: "1800" }), 1800);
  assert.equal(readOtpExpiresInSec({ AUTH_OTP_EXPIRES_IN_SEC: "600" }), 600);
  assert.throws(() => readOtpExpiresInSec({ AUTH_OTP_EXPIRES_IN_SEC: "3600" }));
});
