import { NextResponse } from "next/server";
import { errorResponse, okResponse } from "@/lib/schemas/contracts";
import { readActiveSpeechSettings, saveActiveSpeechSettings } from "@/lib/speech/speechSettingsStore";
import type { SpeechSettingsSnapshot } from "@/lib/types";
import { observeRoute } from "@/lib/observability/route";

async function handleGet() {
  try {
    const snapshot = await readActiveSpeechSettings();
    return NextResponse.json(okResponse(snapshot));
  } catch {
    return NextResponse.json(errorResponse<SpeechSettingsSnapshot>("SPEECH_SETTINGS_READ_FAILED", "读取全局声线配置失败。", true), {
      status: 500
    });
  }
}

async function handlePost(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(errorResponse<SpeechSettingsSnapshot>("INPUT_INVALID", "请求体不是合法 JSON", false), { status: 400 });
  }

  try {
    const snapshot = await saveActiveSpeechSettings((payload as { speechTunings?: unknown }).speechTunings ?? payload);
    return NextResponse.json(okResponse(snapshot));
  } catch {
    return NextResponse.json(errorResponse<SpeechSettingsSnapshot>("SPEECH_SETTINGS_WRITE_FAILED", "保存全局声线配置失败。", true), {
      status: 500
    });
  }
}

export async function GET(request: Request) {
  return observeRoute(request, { route: "/api/speech-settings/active" }, handleGet);
}

export async function POST(request: Request) {
  return observeRoute(request, { route: "/api/speech-settings/active" }, () =>
    handlePost(request)
  );
}
