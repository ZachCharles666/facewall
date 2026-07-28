import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { readTencentSesConfig } = await import("../lib/config/internalBeta");
  const { buildOtpEmailRequest } = await import("../lib/email/tencentSesCore");

  const config = readTencentSesConfig();
  const shouldSend = process.argv.includes("--send");
  const recipient = process.env.TENCENT_SES_TEST_EMAIL?.trim();
  const code = "246810";

  if (!recipient) {
    if (shouldSend) {
      throw new Error("SES_PROBE_CONFIG_INVALID: TENCENT_SES_TEST_EMAIL");
    }
    buildOtpEmailRequest(
      { fromEmail: config.fromEmail, templateId: config.templateId },
      { to: "probe@example.test", code }
    );
    console.log("SES_PROBE_CONFIG_OK");
    console.log("Real delivery skipped. Set TENCENT_SES_TEST_EMAIL locally and rerun with --send.");
    return;
  }

  buildOtpEmailRequest(
    { fromEmail: config.fromEmail, templateId: config.templateId },
    { to: recipient, code }
  );

  if (!shouldSend) {
    console.log("SES_PROBE_CONFIG_OK");
    console.log("Real delivery skipped. Rerun with --send to consume one email.");
    return;
  }

  const { sendOtpEmailWithConfig } = await import("../lib/email/tencentSesTransport");
  const result = await sendOtpEmailWithConfig(config, { to: recipient, code });
  console.log("SES_PROBE_ACCEPTED");
  if (result.requestId) console.log(`RequestId: ${result.requestId}`);
  if (result.messageId) console.log(`MessageId: ${result.messageId}`);
  console.log("Verify receipt, latency, junk-folder placement, and six-digit code replacement.");
}

main().catch((error: unknown) => {
  const providerCode =
    error &&
    typeof error === "object" &&
    "providerCode" in error &&
    typeof error.providerCode === "string" &&
    /^[A-Za-z0-9._-]{1,120}$/.test(error.providerCode)
      ? error.providerCode
      : undefined;
  const safeCode =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : error instanceof Error && /^SES_PROBE_[A-Z_]+: [A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "SES_PROBE_FAILED";
  console.error(safeCode);
  if (providerCode) console.error(`ProviderCode: ${providerCode}`);
  process.exitCode = 1;
});
