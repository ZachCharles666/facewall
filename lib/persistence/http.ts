import { NextResponse } from "next/server";

import { UserAuthError } from "@/lib/auth/user";
import { InterviewPersistenceError } from "@/lib/persistence/interviewSessions";
import { errorResponse } from "@/lib/schemas/contracts";

const messages: Record<string, string> = {
  AUTH_REQUIRED: "请先登录",
  ACCOUNT_UNAVAILABLE: "账号当前不可用",
  CONSENT_REQUIRED: "请先同意当前内测协议",
  INPUT_INVALID: "请求参数不符合会话契约",
  RESOURCE_NOT_FOUND: "会话不存在",
  SESSION_CONFLICT: "会话已在其他页面更新，请刷新后重试",
  INVALID_STATE_TRANSITION: "当前会话状态不允许执行此操作",
  QUESTIONNAIRE_REQUIRED: "请先完成首次面试调研问卷，再开始剩余面试",
  SESSION_QUOTA_EXHAUSTED: "3 次完整面试额度已用完，已有会话仍可继续",
  PERSISTENCE_DISABLED: "面试持久化当前未启用",
  PERSISTENCE_FAILED: "保存失败，页面草稿已保留，请重试"
};

export function persistenceErrorResponse(error: unknown) {
  if (error instanceof UserAuthError) {
    return NextResponse.json(errorResponse(error.code, messages[error.code], false), {
      status: error.status
    });
  }
  if (error instanceof InterviewPersistenceError) {
    const body = errorResponse(error.code, messages[error.code], error.retryable);
    return NextResponse.json(
      error.currentVersion === undefined
        ? body
        : {
            ...body,
            error: {
              ...body.error,
              currentVersion: error.currentVersion
            }
          },
      { status: error.status }
    );
  }
  const errorName = error instanceof Error ? error.name : "unknown";
  const databaseCode =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "unknown";
  console.error(
    "[persistence/http]",
    JSON.stringify({ errorName, code: databaseCode })
  );
  return NextResponse.json(
    errorResponse("PERSISTENCE_FAILED", messages.PERSISTENCE_FAILED, true),
    { status: 500 }
  );
}
