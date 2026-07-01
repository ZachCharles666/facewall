import { NextResponse } from "next/server";
import { shouldInjectDevFault } from "@/lib/dev/ops";
import { azureVoiceOptions } from "@/lib/speech/settings";

export async function GET(request: Request) {
  const azureKey = process.env.AZURE_SPEECH_KEY;
  const azureRegion = process.env.AZURE_SPEECH_REGION || "eastasia";

  return NextResponse.json({
    configured: shouldInjectDevFault(request, "tts") ? false : Boolean(azureKey && azureKey !== "replace_with_your_azure_speech_key"),
    region: azureRegion,
    voices: azureVoiceOptions
  });
}
