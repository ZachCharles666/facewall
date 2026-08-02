import { NextResponse } from "next/server";

import { AdminAuthError } from "@/lib/auth/admin";
import { errorResponse } from "@/lib/schemas/contracts";

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminAuthError) {
    const code = error.status === 401 ? "AUTH_REQUIRED" : "FORBIDDEN";
    return NextResponse.json(errorResponse(code, "无权访问管理接口", false), {
      status: error.status
    });
  }
  if (error instanceof Error && error.message === "INPUT_INVALID") {
    return NextResponse.json(errorResponse("INPUT_INVALID", "请求内容不合法", false), {
      status: 400
    });
  }
  return NextResponse.json(
    errorResponse("ADMIN_OPERATION_FAILED", "管理操作暂时失败，请重试", true),
    { status: 503 }
  );
}
