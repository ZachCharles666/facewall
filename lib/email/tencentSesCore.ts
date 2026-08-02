export const OTP_EMAIL_SUBJECT = "PassBuddy 登录验证码";

export interface OtpEmailInput {
  to: string;
  code: string;
}

export interface OtpTemplateConfig {
  fromEmail: string;
  templateId: number;
}

export interface TencentSendEmailRequest {
  FromEmailAddress: string;
  Subject: string;
  Destination: string[];
  Template: {
    TemplateID: number;
    TemplateData: string;
  };
  TriggerType: number;
}

export class OtpEmailInputError extends Error {
  constructor(public readonly field: "to" | "code") {
    super(`OTP_EMAIL_INPUT_INVALID: ${field}`);
    this.name = "OtpEmailInputError";
  }
}

export function buildOtpEmailRequest(
  config: OtpTemplateConfig,
  input: OtpEmailInput
): TencentSendEmailRequest {
  const to = input.to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new OtpEmailInputError("to");
  }
  if (!/^\d{6}$/.test(input.code)) {
    throw new OtpEmailInputError("code");
  }

  return {
    FromEmailAddress: config.fromEmail,
    Subject: OTP_EMAIL_SUBJECT,
    Destination: [to],
    Template: {
      TemplateID: config.templateId,
      TemplateData: JSON.stringify({ code: input.code })
    },
    TriggerType: 1
  };
}
