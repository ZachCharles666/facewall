import "server-only";

import { getRuntimePool } from "@/lib/db/pool";

export interface AuthProfile {
  userId: string;
  email: string;
  schoolId: string;
  role: "user" | "admin";
  status: string;
  sessionLimit: number;
  sessionsStarted: number;
}

function mapProfile(row: Record<string, unknown>): AuthProfile {
  return {
    userId: String(row.user_id),
    email: String(row.email_normalized),
    schoolId: String(row.school_id),
    role: row.role === "admin" ? "admin" : "user",
    status: String(row.status),
    sessionLimit: Number(row.session_limit),
    sessionsStarted: Number(row.sessions_started)
  };
}

export async function consumeInviteForUser(
  inviteHash: string,
  userId: string,
  email: string,
  options: { databaseFault?: boolean } = {}
) {
  const client = await getRuntimePool().connect();
  try {
    await client.query("begin");
    if (options.databaseFault) {
      await client.query("set local statement_timeout = '1ms'");
      await client.query("select pg_sleep(0.05)");
    }
    const result = await client.query(
      `select *
         from public.consume_invite_code($1, $2, $3)`,
      [inviteHash, userId, email]
    );
    if (!result.rows[0]) throw new Error("PROFILE_INIT_FAILED");
    await client.query("commit");
    return mapProfile(result.rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAuthProfile(userId: string) {
  const client = await getRuntimePool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await client.query(
      `select user_id, email_normalized, school_id, role, status,
              session_limit, sessions_started
         from public.user_profiles
        where user_id = $1`,
      [userId]
    );
    await client.query("commit");
    return result.rows[0] ? mapProfile(result.rows[0]) : null;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeAuthSession(token: string) {
  await getRuntimePool().query(`delete from auth.session where token = $1`, [token]);
}
