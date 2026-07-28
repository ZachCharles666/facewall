import "server-only";

import { withAdminTransaction } from "@/lib/db/context";
import { insertAdminAudit } from "@/lib/admin/audit";

export async function listSchools() {
  return withAdminTransaction(async (client) => {
    const result = await client.query(
      `select id, code, name, email_domains, status, created_at, updated_at
         from public.schools
        order by created_at desc`
    );
    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      emailDomains: row.email_domains,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  });
}

export async function createSchool(input: {
  adminUserId: string;
  requestId: string;
  code: string;
  name: string;
  emailDomains: string[];
}, testOptions: { failAfterMutation?: boolean } = {}) {
  return withAdminTransaction(async (client) => {
    const result = await client.query(
      `insert into public.schools(code, name, email_domains)
       values ($1, $2, $3)
       returning id, code, name, email_domains, status, created_at, updated_at`,
      [input.code, input.name, input.emailDomains]
    );
    const row = result.rows[0];
    if (testOptions.failAfterMutation) {
      throw new Error("IB06_ADMIN_TRANSACTION_FAULT");
    }
    await insertAdminAudit(client, {
      adminUserId: input.adminUserId,
      requestId: input.requestId,
      action: "school.create",
      targetType: "school",
      targetId: row.id,
      outcome: "succeeded",
      metadata: { code: row.code, domainCount: row.email_domains.length }
    });
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      emailDomains: row.email_domains,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
}

export async function listInviteCodes() {
  return withAdminTransaction(async (client) => {
    const result = await client.query(
      `select i.id, i.school_id, s.code as school_code, i.label, i.max_uses,
              i.used_count, i.session_limit_per_user, i.expires_at, i.status,
              i.created_at, i.updated_at
         from public.invite_codes i
         join public.schools s on s.id = i.school_id
        order by i.created_at desc`
    );
    return result.rows.map((row) => ({
      id: row.id,
      schoolId: row.school_id,
      schoolCode: row.school_code,
      label: row.label,
      maxUses: row.max_uses,
      usedCount: row.used_count,
      sessionLimitPerUser: row.session_limit_per_user,
      expiresAt: row.expires_at,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  });
}

interface CreateInviteCodeInput {
  adminUserId: string;
  requestId: string;
  schoolId: string;
  label: string;
  maxUses: number;
  sessionLimitPerUser: number;
  expiresAt: Date | null;
}

export async function createInviteCodes(
  input: CreateInviteCodeInput & { codeHashes: string[] }
) {
  return withAdminTransaction(async (client) => {
    const rows = [];
    for (const [index, codeHash] of input.codeHashes.entries()) {
      const result = await client.query(
        `insert into public.invite_codes(
           school_id, code_hash, label, max_uses, session_limit_per_user,
           expires_at, created_by
         ) values ($1, $2, $3, $4, $5, $6, $7)
         returning id, school_id, label, max_uses, used_count,
                   session_limit_per_user, expires_at, status, created_at`,
        [
          input.schoolId,
          codeHash,
          input.label,
          input.maxUses,
          input.sessionLimitPerUser,
          input.expiresAt,
          input.adminUserId
        ]
      );
      const row = result.rows[0];
      await insertAdminAudit(client, {
        adminUserId: input.adminUserId,
        requestId: input.requestId,
        action: "invite.create",
        targetType: "invite_code",
        targetId: row.id,
        outcome: "succeeded",
        metadata: {
          schoolId: row.school_id,
          maxUses: row.max_uses,
          sessionLimitPerUser: row.session_limit_per_user,
          batchCount: input.codeHashes.length,
          batchIndex: index + 1
        }
      });
      rows.push(row);
    }
    return rows;
  });
}

export async function createInviteCode(
  input: CreateInviteCodeInput & { codeHash: string }
) {
  const [row] = await createInviteCodes({
    ...input,
    codeHashes: [input.codeHash]
  });
  return row;
}

export async function updateInviteCodeStatus(input: {
  adminUserId: string;
  requestId: string;
  inviteId: string;
  status: "active" | "disabled";
}) {
  return withAdminTransaction(async (client) => {
    const result = await client.query(
      `update public.invite_codes
          set status = $2
        where id = $1
        returning id, status, updated_at`,
      [input.inviteId, input.status]
    );
    if (!result.rows[0]) return null;
    await insertAdminAudit(client, {
      adminUserId: input.adminUserId,
      requestId: input.requestId,
      action: input.status === "disabled" ? "invite.disable" : "invite.enable",
      targetType: "invite_code",
      targetId: input.inviteId,
      outcome: "succeeded",
      metadata: { status: input.status }
    });
    return result.rows[0];
  });
}
