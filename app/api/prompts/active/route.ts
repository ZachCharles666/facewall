import { NextResponse } from "next/server";
import { readActivePromptOverrides, saveActivePromptOverrides } from "@/lib/prompts/promptStore";
import { errorResponse, okResponse } from "@/lib/schemas/contracts";
import type { PromptStoreSnapshot } from "@/lib/types";
import { observeRoute } from "@/lib/observability/route";

async function handleGet() {
  try {
    const snapshot = await readActivePromptOverrides();
    return NextResponse.json(okResponse(snapshot));
  } catch {
    return NextResponse.json(errorResponse<PromptStoreSnapshot>("PROMPT_STORE_READ_FAILED", "读取全局 Prompt 失败。", true), {
      status: 500
    });
  }
}

async function handlePost(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(errorResponse<PromptStoreSnapshot>("INPUT_INVALID", "请求体不是合法 JSON", false), { status: 400 });
  }

  try {
    const snapshot = await saveActivePromptOverrides((payload as { promptOverrides?: unknown }).promptOverrides ?? payload);
    return NextResponse.json(okResponse(snapshot));
  } catch {
    return NextResponse.json(errorResponse<PromptStoreSnapshot>("PROMPT_STORE_WRITE_FAILED", "保存全局 Prompt 失败。", true), {
      status: 500
    });
  }
}

export async function GET(request: Request) {
  return observeRoute(request, { route: "/api/prompts/active" }, handleGet);
}

export async function POST(request: Request) {
  return observeRoute(request, { route: "/api/prompts/active" }, () =>
    handlePost(request)
  );
}
