import { randomBytes, randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";

import { parseBootstrapArguments } from "../lib/auth/bootstrapArgs";
import { hashInviteCode, normalizeEmail } from "../lib/auth/challenge";

loadEnvConfig(process.cwd());

const args = parseBootstrapArguments(process.argv.slice(2));
const email = normalizeEmail(args.email);
const adminUrl = process.env.DATABASE_ADMIN_URL?.trim();
const secret = process.env.BETTER_AUTH_SECRET?.trim();
if (!adminUrl || !secret || secret.length < 32) {
  throw new Error("DATABASE_ADMIN_URL and BETTER_AUTH_SECRET are required");
}
const bootstrapSecret = secret;

const pool = new Pool({ connectionString: adminUrl, application_name: "passbuddy-bootstrap" });

async function prepare() {
  if (args.mode !== "prepare") throw new Error("BOOTSTRAP_MODE_INVALID");
  const { schoolCode, schoolName } = args;
  if (!schoolCode || !schoolName || !/^[a-z0-9-]{2,40}$/.test(schoolCode)) {
    throw new Error("--school-code and --school-name are required");
  }
  const userId = `bootstrap-${randomUUID()}`;
  const inviteCode = `PB-${randomBytes(9).toString("base64url").toUpperCase()}`;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query(`select id from auth."user" where email = $1`, [email]);
    const createdBy = existing.rows[0]?.id || userId;
    if (!existing.rows[0]) {
      await client.query(
        `insert into auth."user"(
          id, name, email, "emailVerified", "createdAt", "updatedAt"
        ) values ($1, '', $2, false, now(), now())`,
        [createdBy, email]
      );
    }
    const school = await client.query(
      `insert into public.schools(code, name)
       values ($1, $2)
       on conflict (code) do update set name = excluded.name
       returning id`,
      [schoolCode, schoolName]
    );
    await client.query(
      `insert into public.invite_codes(
        school_id, code_hash, label, max_uses, session_limit_per_user,
        expires_at, created_by
      ) values ($1, $2, 'initial-admin-bootstrap', 1, 3, now() + interval '24 hours', $3)`,
      [school.rows[0].id, hashInviteCode(inviteCode, bootstrapSecret), createdBy]
    );
    await client.query("commit");
    console.log("Bootstrap invite (shown once):", inviteCode);
    console.log("Next: log in with this email/invite, then run bootstrap --promote.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function promote() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `update public.user_profiles p
          set role = 'admin'
         from auth."user" u
        where p.user_id = u.id and u.email = $1 and p.status = 'active'
        returning p.user_id`,
      [email]
    );
    if (result.rowCount !== 1) {
      throw new Error("ADMIN_PROFILE_NOT_READY: finish OTP login first");
    }
    await client.query(
      `insert into public.admin_audit_logs(
         admin_user_id, request_id, action, target_type, target_id, outcome, metadata
       ) values ($1, $2, 'role.promote_admin', 'user_profile', $1, 'succeeded', $3::jsonb)`,
      [
        result.rows[0].user_id,
        `bootstrap-${randomUUID()}`,
        JSON.stringify({ channel: "server_bootstrap" })
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  console.log("Admin profile promoted successfully.");
}

async function main() {
  if (args.mode === "prepare") await prepare();
  else await promote();
}

void main().finally(() => pool.end());
