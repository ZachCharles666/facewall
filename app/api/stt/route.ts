import { NextResponse } from "next/server";
import { shouldInjectDevFault } from "@/lib/dev/ops";
import { structuredLog } from "@/lib/observability/logger";
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

function logAudioLevel(audio: ArrayBuffer) {
  // 16-bit mono PCM behind a 44 byte WAV header, which is all this route is
  // ever sent. Sampled rather than scanned so a 3MB body stays cheap.
  const HEADER_BYTES = 44;
  if (audio.byteLength <= HEADER_BYTES) return;
  const samples = new Int16Array(audio, HEADER_BYTES, (audio.byteLength - HEADER_BYTES) >> 1);
  const stride = Math.max(1, Math.floor(samples.length / 20_000));
  let peak = 0;
  let sumSquares = 0;
  let counted = 0;
  for (let index = 0; index < samples.length; index += stride) {
    const magnitude = Math.abs(samples[index]);
    if (magnitude > peak) peak = magnitude;
    sumSquares += magnitude * magnitude;
    counted += 1;
  }
  const rms = counted > 0 ? Math.sqrt(sumSquares / counted) : 0;
  structuredLog("info", "stt.audio.received", {
    bytes: audio.byteLength,
    approxSeconds: Number(((audio.byteLength - HEADER_BYTES) / 32000).toFixed(1)),
    peak: Math.round((peak / 32768) * 1000) / 1000,
    rms: Math.round((rms / 32768) * 1000) / 1000
  });
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

  // Recorded audio can arrive full-length but silent when the wrong input
  // device is selected or another application holds the microphone. Logging the
  // amplitude makes an empty transcription immediately diagnosable instead of
  // indistinguishable from a recogniser that simply heard nothing useful.
  logAudioLevel(audio);

  // Tencent runs in-region and answers in well under a second; Azure measured
  // 8-10s per segment from this host, which the candidate feels directly on the
  // final segment. Azure stays as the fallback so a Tencent outage or quota
  // problem still leaves a working path.
  if (tencentConfigured) {
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
      if (!azureConfigured) {
        return NextResponse.json({ error: "Tencent ASR request failed." }, { status: 502 });
      }
    }
  }

  if (!azureConfigured) {
    return NextResponse.json({ error: "STT is not configured." }, { status: 503 });
  }

  try {
    const text = await recognizeWithAzure(audio, azureKey as string, azureRegion);
    return NextResponse.json(
      { text, provider: "azure" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    // Report Azure's own status rather than a stale one from the other
    // provider; conflating the two is what made the earlier 401 hard to trace.
    const failure =
      error instanceof SttProviderError
        ? error
        : new SttProviderError("Failed to reach Azure STT.", 502);
    return NextResponse.json({ error: failure.detail }, { status: failure.status });
  }
}

export async function POST(request: Request) {
  return observeRoute(request, { route: "/api/stt", critical: true }, () =>
    handlePost(request)
  );
}
