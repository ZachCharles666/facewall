import { NextResponse } from "next/server";
import { shouldInjectDevFault } from "@/lib/dev/ops";
import { azureVoiceOptions } from "@/lib/speech/settings";
import { observeRoute } from "@/lib/observability/route";
import { readTencentSpeechConfig } from "@/lib/speech/tencentCloud";
import { getLlmProviderDescriptor, isLlmConfigured } from "@/lib/ai/provider";

export const runtime = "nodejs";

async function handleGet(request: Request) {
  const azureKey = process.env.AZURE_SPEECH_KEY;
  const azureRegion = process.env.AZURE_SPEECH_REGION || "eastasia";
  const tencentConfig = readTencentSpeechConfig();
  const azureConfigured = Boolean(
    azureKey && azureKey !== "replace_with_your_azure_speech_key"
  );
  const faulted = shouldInjectDevFault(request, "tts");
  const llm = getLlmProviderDescriptor();

  return NextResponse.json({
    configured: faulted ? false : Boolean(tencentConfig || azureConfigured),
    provider: tencentConfig ? "tencent" : azureConfigured ? "azure" : "web-speech",
    region: tencentConfig?.region || azureRegion,
    voices: azureVoiceOptions,
    llm: {
      configured: isLlmConfigured(),
      provider: llm.provider,
      model: llm.model
    }
  });
}

export async function GET(request: Request) {
  return observeRoute(request, { route: "/api/azure-status" }, () =>
    handleGet(request)
  );
}
