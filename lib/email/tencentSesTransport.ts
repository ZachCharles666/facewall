import { ses } from "tencentcloud-sdk-nodejs";

import type { TencentSesConfig } from "@/lib/config/internalBeta";
import { buildOtpEmailRequest, type OtpEmailInput } from "@/lib/email/tencentSesCore";

const SesClient = ses.v20201002.Client;

export interface OtpEmailDeliveryResult {
  messageId?: string;
  requestId?: string;
}

export class OtpEmailDeliveryError extends Error {
  readonly code = "EMAIL_DELIVERY_FAILED";
  readonly retryable = true;

  constructor(public readonly providerCode?: string) {
    super("EMAIL_DELIVERY_FAILED");
    this.name = "OtpEmailDeliveryError";
  }
}

function providerErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const code = "code" in error ? error.code : undefined;
  return typeof code === "string" && /^[A-Za-z0-9._-]{1,120}$/.test(code) ? code : undefined;
}

export async function sendOtpEmailWithConfig(
  config: TencentSesConfig,
  input: OtpEmailInput
): Promise<OtpEmailDeliveryResult> {
  const client = new SesClient({
    credential: {
      secretId: config.secretId,
      secretKey: config.secretKey
    },
    region: config.region,
    profile: {
      httpProfile: {
        endpoint: "ses.tencentcloudapi.com",
        reqTimeout: 10
      }
    }
  });

  try {
    const response = await client.SendEmail(
      buildOtpEmailRequest(
        {
          fromEmail: config.fromEmail,
          templateId: config.templateId
        },
        input
      )
    );
    return {
      messageId: response.MessageId,
      requestId: response.RequestId
    };
  } catch (error) {
    throw new OtpEmailDeliveryError(providerErrorCode(error));
  }
}
