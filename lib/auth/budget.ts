import "server-only";

import { getRuntimePool } from "@/lib/db/pool";
import type { OtpBudgetConfig } from "@/lib/config/internalBeta";

export type OtpBudgetStatus =
  | "allowed"
  | "allowed_warn"
  | "email_limited"
  | "ip_limited"
  | "budget_exhausted";

export async function reserveOtpSendBudget(
  emailHash: string,
  ipHash: string,
  config: OtpBudgetConfig
) {
  const result = await getRuntimePool().query<{
    status: OtpBudgetStatus;
    global_count: number;
  }>(
    `select status, global_count
       from public.reserve_otp_send_budget($1, $2, $3, $4, $5, $6)`,
    [
      emailHash,
      ipHash,
      config.emailDailyLimit,
      config.ipDailyLimit,
      config.globalWarnLimit,
      config.globalStopLimit
    ]
  );
  const reservation = result.rows[0];
  if (!reservation) throw new Error("OTP_BUDGET_RESERVATION_FAILED");
  return {
    status: reservation.status,
    globalCount: Number(reservation.global_count)
  };
}
