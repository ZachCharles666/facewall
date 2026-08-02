import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { Pool } from "pg";

import { readOtpExpiresInSec } from "./lib/config/internalBeta";

const schemaDatabaseUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgresql://schema_generation:unavailable@127.0.0.1:5432/passbuddy";

export const auth = betterAuth({
  database: new Pool({
    connectionString: schemaDatabaseUrl,
    options: "-c search_path=auth,public"
  }),
  emailAndPassword: {
    enabled: false
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
        const { sendOtpEmail } = await import("./lib/email/tencentSes");
        await sendOtpEmail({ to: email, code: otp });
      }
    })
  ]
});
