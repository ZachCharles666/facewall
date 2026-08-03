import { NextResponse } from "next/server";
import { shouldInjectDevFault } from "@/lib/dev/ops";
import { isInterviewerStyleId } from "@/lib/schemas/contracts";
import { personaVoices, toAzurePitch, toAzureRate, toAzureVolume } from "@/lib/speech/settings";
import { observeRoute } from "@/lib/observability/route";
import { readActiveSpeechSettings } from "@/lib/speech/speechSettingsStore";
import {
  readTencentSpeechConfig,
  synthesizeWithTencent
} from "@/lib/speech/tencentCloud";

export const runtime = "nodejs";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function handlePost(request: Request) {
  if (shouldInjectDevFault(request, "tts")) {
    return NextResponse.json({ error: "开发故障注入：Azure TTS 不可用。" }, { status: 503 });
  }

  const azureKey = process.env.AZURE_SPEECH_KEY;
  const azureRegion = process.env.AZURE_SPEECH_REGION || "eastasia";
  const azureConfigured = Boolean(
    azureKey && azureKey !== "replace_with_your_azure_speech_key"
  );
  const tencentConfigured = Boolean(readTencentSpeechConfig());

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = String(payload.text || "").trim();
  const styleCandidate = payload.styleId ?? payload.persona;
  const styleId = isInterviewerStyleId(styleCandidate) ? styleCandidate : "strictHr";
  const rawVoice = payload.voiceName ?? payload.voice;
  const requestedVoice = typeof rawVoice === "string" && rawVoice !== "auto" ? rawVoice : "";
  const voiceName = requestedVoice || personaVoices[styleId];
  const rate = toAzureRate(typeof payload.rate === "number" || typeof payload.rate === "string" ? payload.rate : undefined);
  const pitch = toAzurePitch(typeof payload.pitch === "number" || typeof payload.pitch === "string" ? payload.pitch : undefined);
  const volume = toAzureVolume(typeof payload.volume === "number" || typeof payload.volume === "string" ? payload.volume : undefined);

  if (!text) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  if (tencentConfigured) {
    try {
      // A voice saved from the Classic tuning panel wins over the environment
      // default, so changing an interviewer's voice needs no redeploy.
      const savedVoiceType = await readActiveSpeechSettings()
        .then((snapshot) => snapshot.speechTunings[styleId]?.tencentVoiceType ?? 0)
        .catch(() => 0);
      const audio = await synthesizeWithTencent({
        text,
        rate: payload.rate as number | string | undefined,
        styleId,
        voiceType: Number(payload.tencentVoiceType) || savedVoiceType
      });
      return new Response(audio, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "X-Speech-Provider": "tencent"
        }
      });
    } catch {
      if (!azureConfigured) {
        return NextResponse.json({ error: "Tencent TTS request failed." }, { status: 502 });
      }
    }
  }

  if (!azureConfigured) {
    return NextResponse.json({ error: "TTS is not configured." }, { status: 503 });
  }

  const ssml = `
<speak version="1.0" xml:lang="zh-CN" xmlns="http://www.w3.org/2001/10/synthesis">
  <voice name="${escapeXml(voiceName)}">
    <prosody rate="${escapeXml(rate)}" pitch="${escapeXml(pitch)}" volume="${escapeXml(volume)}">
      ${escapeXml(text)}
    </prosody>
  </voice>
</speak>`.trim();

  const endpoint = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

  try {
    const azureResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": azureKey as string,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
        "User-Agent": "facewall-next-app"
      },
      body: ssml
    });

    if (!azureResponse.ok) {
      return NextResponse.json({ error: "Azure TTS request failed." }, { status: azureResponse.status });
    }

    return new Response(await azureResponse.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Azure-Voice": voiceName,
        "X-Speech-Provider": "azure"
      }
    });
  } catch {
    return NextResponse.json({ error: "Failed to reach Azure TTS." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  return observeRoute(request, { route: "/api/tts", critical: true }, () =>
    handlePost(request)
  );
}
