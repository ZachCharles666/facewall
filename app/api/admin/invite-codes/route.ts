import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { adminErrorResponse } from "@/lib/auth/adminResponse";
import { recordAdminAuditFailure } from "@/lib/admin/audit";
import {
  createInviteCodes,
  listInviteCodes,
  updateInviteCodeStatus
} from "@/lib/admin/operations";
import { hashInviteCode } from "@/lib/auth/challenge";
import { readAuthConfig } from "@/lib/config/internalBeta";
import { getCurrentRequestId } from "@/lib/observability/context";
import { observeRoute } from "@/lib/observability/route";
import { errorResponse, okResponse } from "@/lib/schemas/contracts";

export const runtime = "nodejs";

async function handleGet(request: Request) {
  try {
    await requireAdmin(request);
    return NextResponse.json(okResponse(await listInviteCodes()));
  } catch (error) {
    return adminErrorResponse(error);
  }
}

async function handlePost(request: Request) {
  let adminUserId: string | null = null;
  try {
    const admin = await requireAdmin(request);
    adminUserId = admin.userId;
    const payload = (await request.json()) as Record<string, unknown>;
    const maxUses =
      payload.maxUses === undefined ? 1 : Number(payload.maxUses);
    const batchCount =
      payload.batchCount === undefined ? 1 : Number(payload.batchCount);
    const sessionLimitPerUser =
      payload.sessionLimitPerUser === undefined ? 3 : Number(payload.sessionLimitPerUser);
    const expiresAt =
      typeof payload.expiresAt === "string" && payload.expiresAt
        ? new Date(payload.expiresAt)
        : null;
    if (
      typeof payload.schoolId !== "string" ||
      typeof payload.label !== "string" ||
      payload.label.trim().length < 2 ||
      payload.label.trim().length > 100 ||
      !Number.isSafeInteger(maxUses) ||
      maxUses < 1 ||
      maxUses > 1000 ||
      !Number.isSafeInteger(batchCount) ||
      batchCount < 1 ||
      batchCount > 100 ||
      !Number.isSafeInteger(sessionLimitPerUser) ||
      sessionLimitPerUser < 1 ||
      sessionLimitPerUser > 100 ||
      (expiresAt && Number.isNaN(expiresAt.getTime()))
    ) {
      throw new Error("INPUT_INVALID");
    }

    const inviteCodes = Array.from(
      { length: batchCount },
      () => `PB-${randomBytes(9).toString("base64url").toUpperCase()}`
    );
    const secret = readAuthConfig().secret;
    const rows = await createInviteCodes({
      adminUserId: admin.userId,
      requestId: getCurrentRequestId()!,
      schoolId: payload.schoolId,
      codeHashes: inviteCodes.map((inviteCode) =>
        hashInviteCode(inviteCode, secret)
      ),
      label: payload.label.trim(),
      maxUses,
      sessionLimitPerUser,
      expiresAt
    });
    const created = rows.map((row, index) => ({
      id: row.id,
      schoolId: row.school_id,
      label: row.label,
      maxUses: row.max_uses,
      usedCount: row.used_count,
      sessionLimitPerUser: row.session_limit_per_user,
      expiresAt: row.expires_at,
      status: row.status,
      inviteCode: inviteCodes[index],
      plaintextShownOnce: true
    }));
    const first = created[0];
    return NextResponse.json(
      okResponse({
        ...first,
        batchCount: created.length,
        inviteCodes: created
      }),
      { status: 201 }
    );
  } catch (error) {
    if (adminUserId) {
      await recordAdminAuditFailure({
        adminUserId,
        requestId: getCurrentRequestId()!,
        action: "invite.create",
        targetType: "invite_code",
        metadata: { errorCode: error instanceof Error ? error.name : "unknown" }
      });
    }
    return adminErrorResponse(error);
  }
}

async function handlePatch(request: Request) {
  let adminUserId: string | null = null;
  try {
    const admin = await requireAdmin(request);
    adminUserId = admin.userId;
    const payload = (await request.json()) as Record<string, unknown>;
    if (
      typeof payload.id !== "string" ||
      (payload.status !== "active" && payload.status !== "disabled")
    ) {
      throw new Error("INPUT_INVALID");
    }
    const row = await updateInviteCodeStatus({
      adminUserId: admin.userId,
      requestId: getCurrentRequestId()!,
      inviteId: payload.id,
      status: payload.status
    });
    if (!row) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", "邀请码不存在", false),
        { status: 404 }
      );
    }
    return NextResponse.json(
      okResponse({
        id: row.id,
        status: row.status,
        updatedAt: row.updated_at
      })
    );
  } catch (error) {
    if (adminUserId) {
      await recordAdminAuditFailure({
        adminUserId,
        requestId: getCurrentRequestId()!,
        action: "invite.status_change",
        targetType: "invite_code",
        metadata: { errorCode: error instanceof Error ? error.name : "unknown" }
      });
    }
    return adminErrorResponse(error);
  }
}

export async function GET(request: Request) {
  return observeRoute(request, { route: "/api/admin/invite-codes" }, () =>
    handleGet(request)
  );
}

export async function POST(request: Request) {
  return observeRoute(
    request,
    {
      route: "/api/admin/invite-codes",
      critical: true,
      writeSecurity: {
        body: "json",
        maxBodyBytes: 8192,
        limit: 60,
        windowSeconds: 60
      }
    },
    () => handlePost(request)
  );
}

export async function PATCH(request: Request) {
  return observeRoute(
    request,
    {
      route: "/api/admin/invite-codes",
      critical: true,
      writeSecurity: {
        body: "json",
        maxBodyBytes: 4096,
        limit: 60,
        windowSeconds: 60
      }
    },
    () => handlePatch(request)
  );
}
