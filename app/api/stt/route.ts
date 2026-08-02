import { NextResponse } from "next/server";
import { shouldInjectDevFault } from "@/lib/dev/ops";
import { observeRoute } from "@/lib/observability/route";
import {
  readTencentSpeechConfig,
  recognizeWithTencent
} from "@/lib/speech/tencentCloud";

export const runtime = "nodejs";

type AzureSimpleSttResponse = {
  RecognitionStatus?: string;
  DisplayText?: string;
  NBest?: Array<{ Display?: string; Lexical?: string }>;
};

function pickTranscript(payload: AzureSimpleSttResponse) {
  return (payload.DisplayText || payload.NBest?.[0]?.Display || payload.NBest?.[0]?.Lexical || "").trim();
}

class SttProviderError extends Error {
  constructor(
    public readonly detail: string,
    public readonly status: number
  ) {
    super(detail);
  }
}

async function recognizeWithAzure(audio: ArrayBuffer, key: string, region: string) {
  const endpoint = new URL(
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`
  );
  endpoint.searchParams.set("language", "zh-CN");
  endpoint.searchParams.set("format", "simple");

  let azureResponse: Response;
  try {
    azureResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Accept": "application/json",
        "User-Agent": "facewall-next-app"
      },
      body: audio
    });
  } catch {
    throw new SttProviderError("Failed to reach Azure STT.", 502);
  }

  if (!azureResponse.ok) {
    throw new SttProviderError(
      `Azure STT request failed (${azureResponse.status}).`,
      azureResponse.status
    );
  }

  const payload = (await azureResponse.json()) as AzureSimpleSttResponse;
  const text = pickTranscript(payload);
  if (!text) {
    throw new SttProviderError(
      `Azure STT did not return text (${payload.RecognitionStatus || "NoText"}).`,
      422
    );
  }
  return text;
}

async function handlePost(request: Request) {
  if (shouldInjectDevFault(request, "stt")) {
    return NextResponse.json({ error: "开发故障注入：Azure STT 不可用。" }, { status: 503 });
  }

  const azureKey = process.env.AZURE_SPEECH_KEY;
  const azureRegion = process.env.AZURE_SPEECH_REGION || "eastasia";
  const azureConfigured = Boolean(
    azureKey && azureKey !== "replace_with_your_azure_speech_key"
  );
  const tencentConfigured = Boolean(readTencentSpeechConfig());

  const audio = await request.arrayBuffer();
  if (audio.byteLength < 512) {
    return NextResponse.json({ error: "Audio body is empty." }, { status: 400 });
  }

  if (audio.byteLength > 3 * 1024 * 1024) {
    return NextResponse.json({ error: "Audio body is too large." }, { status: 413 });
  }

  // Azure is the preferred engine; Tencent covers its free-tier concurrency
  // limits and any transient failure so a candidate is never blocked mid-answer.
  let azureError: SttProviderError | null = null;
  if (azureConfigured) {
    try {
      const text = await recognizeWithAzure(audio, azureKey as string, azureRegion);
      return NextResponse.json(
        { text, provider: "azure" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    } catch (error) {
      azureError =
        error instanceof SttProviderError
          ? error
          : new SttProviderError("Failed to reach Azure STT.", 502);
      if (!tencentConfigured) {
        return NextResponse.json({ error: azureError.detail }, { status: azureError.status });
      }
    }
  }

  if (!tencentConfigured) {
    return NextResponse.json({ error: "STT is not configured." }, { status: 503 });
  }

  try {
    const text = await recognizeWithTencent({
      audio: Buffer.from(audio),
      contentType: request.headers.get("content-type") || "audio/wav"
    });
    return NextResponse.json(
      { text, provider: "tencent" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // Surface the Tencent failure on its own terms. Reporting a stale Azure
    // status here is what made the earlier 401 so hard to trace.
    return NextResponse.json({ error: "Tencent ASR request failed." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  return observeRoute(request, { route: "/api/stt", critical: true }, () =>
    handlePost(request)
  );
}
