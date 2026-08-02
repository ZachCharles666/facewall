import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";

loadEnvConfig(process.cwd());

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim();
const runtimeUrl = process.env.DATABASE_URL?.trim();
if (!adminUrl || !runtimeUrl) {
  throw new Error("DATABASE_ADMIN_URL and DATABASE_URL are required");
}

const admin = new Pool({ connectionString: adminUrl });
const runtime = new Pool({ connectionString: runtimeUrl });

async function withIdentity<T>(
  userId: string,
  operation: (client: PoolClient) => Promise<T>
) {
  const client = await runtime.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const adminId = `ib07-admin-${suffix}`;
  const userA = `ib07-user-a-${suffix}`;
  const userB = `ib07-user-b-${suffix}`;
  const retryUser = `ib07-retry-${suffix}`;
  const rateHash = createHash("sha256").update(`ib07-rate-${suffix}`).digest("hex");
  const userIds = [adminId, userA, userB, retryUser];
  let schoolA = "";
  let schoolB = "";

  try {
    for (const id of userIds) {
      await admin.query(
        `insert into auth."user"(
           id, name, email, "emailVerified", "createdAt", "updatedAt"
         ) values ($1, $1, $2, true, now(), now())`,
        [id, `${id}@example.test`]
      );
    }
    const schools = await admin.query(
      `insert into public.schools(code, name)
       values ($1, 'IB07 School A'), ($2, 'IB07 School B')
       returning id, code`,
      [`ib07-a-${suffix}`, `ib07-b-${suffix}`]
    );
    schoolA = String(schools.rows.find((row) => row.code === `ib07-a-${suffix}`).id);
    schoolB = String(schools.rows.find((row) => row.code === `ib07-b-${suffix}`).id);
    const inviteA = await admin.query(
      `insert into public.invite_codes(
         school_id, code_hash, label, max_uses, created_by
       ) values ($1, $2, 'ib07-a', 3, $3) returning id`,
      [schoolA, `ib07-a-${suffix}`, adminId]
    );
    const inviteB = await admin.query(
      `insert into public.invite_codes(
         school_id, code_hash, label, max_uses, created_by
       ) values ($1, $2, 'ib07-b', 3, $3) returning id`,
      [schoolB, `ib07-b-${suffix}`, adminId]
    );
    for (const [id, targetSchool, inviteId, role] of [
      [adminId, schoolA, inviteA.rows[0].id, "admin"],
      [userA, schoolA, inviteA.rows[0].id, "user"],
      [userB, schoolB, inviteB.rows[0].id, "user"]
    ]) {
      await admin.query(
        `insert into public.user_profiles(
           user_id, school_id, invite_code_id, email_normalized, role
         ) values ($1, $2, $3, $4, $5)`,
        [id, targetSchool, inviteId, `${id}@example.test`, role]
      );
    }
    const sessionB = await admin.query(
      `insert into public.interview_sessions(
         user_id, school_id, resume_text, jd_text,
         interviewer_style_id, idempotency_key
       ) values ($1, $2, 'fixture resume B', 'fixture jd B', 'techBro', gen_random_uuid())
       returning id`,
      [userB, schoolB]
    );

    const ownView = await withIdentity(userA, (client) =>
      client.query(
        `select id from public.interview_sessions where id = $1`,
        [sessionB.rows[0].id]
      )
    );
    assert.equal(ownView.rowCount, 0);

    const crossSchool = await withIdentity(userA, (client) =>
      client.query(`select id from public.schools where id = $1`, [schoolB])
    );
    assert.equal(crossSchool.rowCount, 0);

    const selfPromotion = await withIdentity(userA, (client) =>
      client.query(
        `update public.user_profiles set role = 'admin' where user_id = $1`,
        [userA]
      )
    );
    assert.equal(selfPromotion.rowCount, 0);

    const retryInvite = await admin.query(
      `insert into public.invite_codes(
         school_id, code_hash, label, max_uses, created_by
       ) values ($1, $2, 'ib07-retry', 1, $3) returning id`,
      [schoolA, `ib07-retry-${suffix}`, adminId]
    );
    await assert.rejects(
      runtime.query(
        `select (public.consume_invite_code($1, $2, $3)).user_id`,
        [`ib07-retry-${suffix}`, retryUser, null]
      ),
      /null value|not-null constraint/i
    );
    const failedActivation = await admin.query(
      `select
         (select used_count from public.invite_codes where id = $1)::int as used_count,
         (select count(*) from public.user_profiles where user_id = $2)::int as profiles`,
      [retryInvite.rows[0].id, retryUser]
    );
    assert.equal(failedActivation.rows[0].used_count, 0);
    assert.equal(failedActivation.rows[0].profiles, 0);

    await runtime.query(
      `select (public.consume_invite_code($1, $2, $3)).user_id`,
      [`ib07-retry-${suffix}`, retryUser, `${retryUser}@example.test`]
    );
    const replayInvite = await admin.query(
      `insert into public.invite_codes(
         school_id, code_hash, label, max_uses, created_by
       ) values ($1, $2, 'ib07-replay', 1, $3) returning id`,
      [schoolA, `ib07-replay-${suffix}`, adminId]
    );
    const replay = await runtime.query(
      `select (public.consume_invite_code($1, $2, $3)).user_id`,
      [`ib07-replay-${suffix}`, retryUser, `${retryUser}@example.test`]
    );
    assert.equal(replay.rows[0].user_id, retryUser);
    const activationReconciliation = await admin.query(
      `select
         (select used_count from public.invite_codes where id = $1)::int as first_used,
         (select used_count from public.invite_codes where id = $2)::int as replay_used,
         (select count(*) from public.user_profiles where user_id = $3)::int as profiles`,
      [retryInvite.rows[0].id, replayInvite.rows[0].id, retryUser]
    );
    assert.equal(activationReconciliation.rows[0].first_used, 1);
    assert.equal(activationReconciliation.rows[0].replay_used, 0);
    assert.equal(activationReconciliation.rows[0].profiles, 1);

    const privilege = await runtime.query(
      `select has_table_privilege(
         current_user, 'auth.write_rate_limit_counters', 'SELECT'
       ) as can_read`
    );
    assert.equal(privilege.rows[0].can_read, false);

    const reserve = (route: string) =>
      runtime.query(
        `select allowed, retry_after_seconds, attempt_count
           from public.reserve_write_rate_limit($1, $2, 'POST', 2, 60)`,
        [rateHash, route]
      );
    assert.equal((await reserve("/api/events")).rows[0].allowed, true);
    assert.equal((await reserve("/api/events")).rows[0].allowed, true);
    const limited = await reserve("/api/events");
    assert.equal(limited.rows[0].allowed, false);
    assert.ok(Number(limited.rows[0].retry_after_seconds) >= 1);
    assert.equal((await reserve("/api/auth/verify-otp")).rows[0].allowed, true);

    console.log(JSON.stringify({
      ok: true,
      idor: {
        crossUserSessionRows: 0,
        crossSchoolRows: 0,
        selfRolePromotion: "blocked"
      },
      activationRecovery: {
        failedAttemptUsedCount: 0,
        retryProfiles: 1,
        repeatedLoginAdditionalInviteUses: 0
      },
      rateLimit: {
        sequence: ["allowed", "allowed", "limited"],
        rawCounterRead: false,
        routeIsolation: true
      }
    }));
  } finally {
    await admin.query(
      `delete from auth.write_rate_limit_counters where scope_hash = $1`,
      [rateHash]
    ).catch(() => undefined);
    await admin.query(
      `delete from public.interview_sessions where user_id = any($1::text[])`,
      [userIds]
    ).catch(() => undefined);
    await admin.query(
      `delete from public.user_profiles where user_id = any($1::text[])`,
      [userIds]
    ).catch(() => undefined);
    await admin.query(
      `delete from public.invite_codes where created_by = $1`,
      [adminId]
    ).catch(() => undefined);
    if (schoolA || schoolB) {
      await admin.query(
        `delete from public.schools where id = any($1::uuid[])`,
        [[schoolA, schoolB].filter(Boolean)]
      ).catch(() => undefined);
    }
    await admin.query(
      `delete from auth."user" where id = any($1::text[])`,
      [userIds]
    ).catch(() => undefined);
    await Promise.all([admin.end(), runtime.end()]);
  }
}

void main();
