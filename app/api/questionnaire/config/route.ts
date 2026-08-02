import { NextResponse } from "next/server";

import { observeRoute } from "@/lib/observability/route";
import {
  isQuestionnaireConfigWriteEnabled,
  readQuestionnaireConfig,
  saveQuestionnaireConfig
} from "@/lib/questionnaire/store";
import { errorResponse, okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handleGet() {
  try {
    return NextResponse.json(
      okResponse({
        config: await readQuestionnaireConfig(),
        writable: isQuestionnaireConfigWriteEnabled()
      })
    );
  } catch {
    return NextResponse.json(
      errorResponse("QUESTIONNAIRE_CONFIG_READ_FAILED", "问卷配置读取失败。", true),
      { status: 500 }
    );
  }
}

async function handlePost(request: Request) {
  if (!isQuestionnaireConfigWriteEnabled()) {
    return NextResponse.json(
      errorResponse(
        "QUESTIONNAIRE_CONFIG_READ_ONLY",
        "当前环境未开放问卷配置写入。",
        false
      ),
      { status: 403 }
    );
  }
  try {
    const payload = (await request.json()) as { config?: unknown };
    return NextResponse.json(
      okResponse({ config: await saveQuestionnaireConfig(payload.config ?? payload) })
    );
  } catch {
    return NextResponse.json(
      errorResponse("INPUT_INVALID", "问卷配置不合法或保存失败。", true),
      { status: 400 }
    );
  }
}

export async function GET(request: Request) {
  return observeRoute(request, { route: "/api/questionnaire/config" }, handleGet);
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    {
      route: "/api/questionnaire/config",
      writeSecurity: {
        body: "json",
        maxBodyBytes: 32768,
        limit: 20,
        windowSeconds: 60
      }
    },
    () => handlePost(request)
  );
}

