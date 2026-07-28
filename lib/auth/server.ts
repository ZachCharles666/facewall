import "server-only";

import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";

import { readAuthConfig, readOtpExpiresInSec } from "@/lib/config/internalBeta";
import { getRuntimePool } from "@/lib/db/pool";
import { sendOtpEmail } from "@/lib/email/tencentSes";

type PassBuddyAuth = ReturnType<typeof createAuth>;

declare global {
  var __passbuddyAuth: PassBuddyAuth | undefined;
}

function createAuth() {
  const authConfig = readAuthConfig();
  return betterAuth({
    appName: "PassBuddy",
    baseURL: authConfig.baseUrl,
    secret: authConfig.secret,
    database: getRuntimePool(),
    emailAndPassword: {
      enabled: false
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production"
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: readOtpExpiresInSec(),
        allowedAttempts: 3,
        storeOTP: "hashed",
        resendStrategy: "rotate",
        rateLimit: {
          window: 60,
          max: 1
        },
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== "sign-in") {
            throw new Error("OTP_EMAIL_TYPE_UNSUPPORTED");
          }
          await sendOtpEmail({ to: email, code: otp });
        }
      })
    ]
  });
}

export function getAuth() {
  globalThis.__passbuddyAuth ??= createAuth();
  return globalThis.__passbuddyAuth;
}
