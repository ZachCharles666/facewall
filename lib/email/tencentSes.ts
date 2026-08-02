import "server-only";

import { readTencentSesConfig } from "@/lib/config/internalBeta";
import type { OtpEmailInput } from "@/lib/email/tencentSesCore";
import {
  OtpEmailDeliveryError,
  sendOtpEmailWithConfig,
  type OtpEmailDeliveryResult
} from "@/lib/email/tencentSesTransport";

export { OtpEmailDeliveryError };
export type { OtpEmailDeliveryResult };

export async function sendOtpEmail(input: OtpEmailInput): Promise<OtpEmailDeliveryResult> {
  return sendOtpEmailWithConfig(readTencentSesConfig(), input);
}
