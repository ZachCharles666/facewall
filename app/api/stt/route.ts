import { NextResponse } from "next/server";
import { shouldInjectDevFault } from "@/lib/dev/ops";

type AzureSimpleSttResponse = {
  RecognitionStatus?: string;
  DisplayText?: string;
  NBest?: Array<{ Display?: string; Lexical?: string }>;
};

function pickTranscript(payload: AzureSimpleSttResponse) {
  return (payload.DisplayText || payload.NBest?.[0]?.Display || payload.NBest?.[0]?.Lexical || "").trim();
}

export async function POST(request: Request) {
  if (shouldInjectDevFault(request, "tts")) {
    return NextResponse.json({ error: "开发故障注入：Azure STT 不可用。" }, { status: 503 });
  }

  const azureKey = process.env.AZURE_SPEECH_KEY;
  const azureRegion = process.env.AZURE_SPEECH_REGION || "eastasia";

  if (!azureKey || azureKey === "replace_with_your_azure_speech_key") {
    return NextResponse.json({ error: "Azure STT is not configured." }, { status: 503 });
  }

  const audio = await request.arrayBuffer();
  if (audio.byteLength < 512) {
    return NextResponse.json({ error: "Audio body is empty." }, { status: 400 });
  }

  const endpoint = new URL(`https://${azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`);
  endpoint.searchParams.set("language", "zh-CN");
  endpoint.searchParams.set("format", "simple");

  try {
    const azureResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": azureKey,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Accept": "application/json",
        "User-Agent": "facewall-next-app"
      },
      body: audio
    });

    if (!azureResponse.ok) {
      return NextResponse.json({ error: `Azure STT request failed (${azureResponse.status}).` }, { status: azureResponse.status });
    }

    const payload = (await azureResponse.json()) as AzureSimpleSttResponse;
    const text = pickTranscript(payload);
    if (!text) {
      return NextResponse.json({ error: `Azure STT did not return text (${payload.RecognitionStatus || "NoText"}).` }, { status: 422 });
    }

    return NextResponse.json(
      { text },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch {
    return NextResponse.json({ error: "Failed to reach Azure STT." }, { status: 502 });
  }
}
