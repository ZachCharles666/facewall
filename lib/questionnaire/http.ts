import { NextResponse } from "next/server";

import { UserAuthError } from "@/lib/auth/user";
import { QuestionnaireError } from "@/lib/questionnaire/responses";
import { errorResponse } from "@/lib/schemas/contracts";

const messages: Record<string, string> = {
  AUTH_REQUIRED: "请先登录",
  ACCOUNT_UNAVAILABLE: "账号当前不可用",
  INPUT_INVALID: "问卷回答不符合配置要求",
  RESOURCE_NOT_FOUND: "面试会话不存在",
  INVALID_STATE_TRANSITION: "报告尚未完成，暂时不能参与问卷",
  QUESTIONNAIRE_NOT_ELIGIBLE: "本问卷仅在首次完成面试后参与",
  QUESTIONNAIRE_VERSION_OUTDATED: "问卷已更新，请重新加载后填写",
  QUESTIONNAIRE_FAILED: "问卷保存失败，请稍后重试"
};

export function questionnaireErrorResponse(error: unknown) {
  if (error instanceof UserAuthError) {
    return NextResponse.json(errorResponse(error.code, messages[error.code], false), {
      status: error.status
    });
  }
  if (error instanceof QuestionnaireError) {
    return NextResponse.json(
      errorResponse(error.code, messages[error.code], error.retryable),
      { status: error.status }
    );
  }
  console.error(
    "[questionnaire/http]",
    JSON.stringify({ errorName: error instanceof Error ? error.name : "unknown" })
  );
  return NextResponse.json(
    errorResponse("QUESTIONNAIRE_FAILED", messages.QUESTIONNAIRE_FAILED, true),
    { status: 500 }
  );
}
