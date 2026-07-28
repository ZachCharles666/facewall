import { NextResponse } from "next/server";

import { UserAuthError } from "@/lib/auth/user";
import { FeedbackError } from "@/lib/feedback/feedback";
import { errorResponse } from "@/lib/schemas/contracts";

const messages: Record<string, string> = {
  AUTH_REQUIRED: "请先登录",
  ACCOUNT_UNAVAILABLE: "账号当前不可用",
  INPUT_INVALID: "反馈内容不符合接口契约",
  RESOURCE_NOT_FOUND: "面试会话不存在",
  INVALID_STATE_TRANSITION: "报告尚未完成，暂时不能提交反馈",
  FEEDBACK_FAILED: "反馈保存失败，报告仍可查看，请稍后重试"
};

export function feedbackErrorResponse(error: unknown) {
  if (error instanceof UserAuthError) {
    return NextResponse.json(errorResponse(error.code, messages[error.code], false), {
      status: error.status
    });
  }
  if (error instanceof FeedbackError) {
    return NextResponse.json(
      errorResponse(error.code, messages[error.code], error.retryable),
      { status: error.status }
    );
  }
  console.error("[feedback/http]", JSON.stringify({ errorName: error instanceof Error ? error.name : "unknown" }));
  return NextResponse.json(
    errorResponse("FEEDBACK_FAILED", messages.FEEDBACK_FAILED, true),
    { status: 500 }
  );
}
