import { NextResponse } from "next/server";

import { UserAuthError } from "@/lib/auth/user";
import { PrivacyError } from "@/lib/privacy/consent";
import { errorResponse } from "@/lib/schemas/contracts";

const messages: Record<string, string> = {
  AUTH_REQUIRED: "请先登录",
  ACCOUNT_UNAVAILABLE: "账号当前不可用",
  INPUT_INVALID: "请求内容不符合隐私接口契约",
  POLICY_VERSION_OUTDATED: "协议版本已更新，请重新阅读当前版本",
  RESOURCE_NOT_FOUND: "删除请求不存在",
  INVALID_STATE_TRANSITION: "当前删除请求状态不允许执行此操作",
  PRIVACY_OPERATION_FAILED: "隐私操作暂时失败，请稍后重试"
};

export function privacyErrorResponse(error: unknown) {
  if (error instanceof PrivacyError) {
    return NextResponse.json(
      errorResponse(error.code, messages[error.code], error.retryable),
      { status: error.status }
    );
  }
  if (error instanceof UserAuthError) {
    return NextResponse.json(
      errorResponse(error.code, messages[error.code], false),
      { status: error.status }
    );
  }
  const errorName = error instanceof Error ? error.name : "unknown";
  const databaseCode =
    error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
  console.error("[privacy/http]", JSON.stringify({ errorName, code: databaseCode }));
  return NextResponse.json(
    errorResponse("PRIVACY_OPERATION_FAILED", messages.PRIVACY_OPERATION_FAILED, true),
    { status: 500 }
  );
}
