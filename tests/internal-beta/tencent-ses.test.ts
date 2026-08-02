import assert from "node:assert/strict";
import test from "node:test";

import {
  OtpEmailInputError,
  buildOtpEmailRequest
} from "../../lib/email/tencentSesCore";
import { OtpEmailDeliveryError } from "../../lib/email/tencentSesTransport";

test("builds a transactional SES template request without logging or mutating the OTP", () => {
  const request = buildOtpEmailRequest(
    {
      fromEmail: "PassBuddy <no-reply@facewall-mail.example.com>",
      templateId: 123
    },
    {
      to: " Student@QQ.com ",
      code: "024681"
    }
  );

  assert.deepEqual(request, {
    FromEmailAddress: "PassBuddy <no-reply@facewall-mail.example.com>",
    Subject: "PassBuddy 登录验证码",
    Destination: ["student@qq.com"],
    Template: {
      TemplateID: 123,
      TemplateData: JSON.stringify({ code: "024681" })
    },
    TriggerType: 1
  });
});

test("rejects invalid recipients and non-six-digit OTP values", () => {
  assert.throws(
    () =>
      buildOtpEmailRequest(
        { fromEmail: "no-reply@example.com", templateId: 123 },
        { to: "invalid", code: "123456" }
      ),
    (error) => error instanceof OtpEmailInputError && error.field === "to"
  );

  assert.throws(
    () =>
      buildOtpEmailRequest(
        { fromEmail: "no-reply@example.com", templateId: 123 },
        { to: "student@example.com", code: "12345a" }
      ),
    (error) => error instanceof OtpEmailInputError && error.field === "code"
  );
});

test("maps provider failures to a stable error without carrying provider messages", () => {
  const error = new OtpEmailDeliveryError("AuthFailure.SecretIdNotFound");
  assert.equal(error.message, "EMAIL_DELIVERY_FAILED");
  assert.equal(error.code, "EMAIL_DELIVERY_FAILED");
  assert.equal(error.retryable, true);
  assert.equal(error.providerCode, "AuthFailure.SecretIdNotFound");
});
