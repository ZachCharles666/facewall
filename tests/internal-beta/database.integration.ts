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
const runtime = new Pool({ connectionString: runtimeUrl, max: 2 });

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
  const adminId = `admin-${suffix}`;
  const userA = `user-a-${suffix}`;
  const userB = `user-b-${suffix}`;

  const authTables = await admin.query(
    "select table_name from information_schema.tables where table_schema = 'auth'"
  );
  assert.deepEqual(
    authTables.rows.map((row) => row.table_name).sort(),
    [
      "account",
      "otp_send_counters",
      "session",
      "user",
      "verification",
      "write_rate_limit_counters"
    ]
  );

  const businessTables = await admin.query(`
    select c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (
        'schools', 'invite_codes', 'user_profiles', 'consent_records',
        'interview_sessions', 'interview_answers', 'feedback',
        'product_events', 'deletion_requests'
      )
  `);
  assert.equal(businessTables.rowCount, 9);
  assert.ok(
    businessTables.rows.every(
      (row) => row.relrowsecurity === true && row.relforcerowsecurity === true
    )
  );

  for (const [id, email] of [
    [adminId, `${adminId}@example.test`],
    [userA, `${userA}@example.test`],
    [userB, `${userB}@example.test`]
  ]) {
    await admin.query(
      `insert into auth."user"(
        id, name, email, "emailVerified", "createdAt", "updatedAt"
      ) values ($1, $1, $2, true, now(), now())`,
      [id, email]
    );
  }

  const school = await admin.query(
    "insert into public.schools(code, name) values ($1, $2) returning id",
    [`school-${suffix}`, "Fixture University"]
  );
  const schoolId = school.rows[0].id as string;
  await admin.query(
    `insert into public.invite_codes(
      school_id, code_hash, label, max_uses, created_by
    ) values ($1, $2, 'fixture', 1, $3)`,
    [schoolId, `hash-${suffix}`, adminId]
  );

  const precheck = await runtime.query(
    "select public.check_invite_code($1) as status",
    [`hash-${suffix}`]
  );
  assert.equal(precheck.rows[0].status, "valid");
  const missingPrecheck = await runtime.query(
    "select public.check_invite_code($1) as status",
    [`missing-${suffix}`]
  );
  assert.equal(missingPrecheck.rows[0].status, "invalid");
  await admin.query(
    `insert into public.invite_codes(
      school_id, code_hash, label, max_uses, expires_at, status, created_by
    ) values
      ($1, $2, 'expired-fixture', 1, now() - interval '1 minute', 'active', $4),
      ($1, $3, 'disabled-fixture', 1, now() + interval '1 day', 'disabled', $4)`,
    [schoolId, `expired-${suffix}`, `disabled-${suffix}`, adminId]
  );
  const expiredPrecheck = await runtime.query(
    "select public.check_invite_code($1) as status",
    [`expired-${suffix}`]
  );
  assert.equal(expiredPrecheck.rows[0].status, "expired");
  const disabledPrecheck = await runtime.query(
    "select public.check_invite_code($1) as status",
    [`disabled-${suffix}`]
  );
  assert.equal(disabledPrecheck.rows[0].status, "invalid");

  const consume = (userId: string) =>
    runtime.query("select (public.consume_invite_code($1, $2, $3)).user_id", [
      `hash-${suffix}`,
      userId,
      `${userId}@example.test`
    ]);
  const concurrent = await Promise.allSettled([consume(userA), consume(userB)]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);

  const invite = await admin.query(
    "select used_count from public.invite_codes where code_hash = $1",
    [`hash-${suffix}`]
  );
  assert.equal(invite.rows[0].used_count, 1);
  const exhaustedPrecheck = await runtime.query(
    "select public.check_invite_code($1) as status",
    [`hash-${suffix}`]
  );
  assert.equal(exhaustedPrecheck.rows[0].status, "exhausted");
  const entitlement = await admin.query(
    `select session_limit, sessions_started
       from public.user_profiles
      where user_id in ($1, $2)`,
    [userA, userB]
  );
  assert.equal(entitlement.rowCount, 1);
  assert.equal(entitlement.rows[0].session_limit, 3);
  assert.equal(entitlement.rows[0].sessions_started, 0);

  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  const currentBudget = await admin.query(
    `select coalesce(max(attempt_count), 0)::int as count
       from auth.otp_send_counters
      where scope_type = 'global'
        and scope_hash = 'daily'
        and bucket_date = (now() at time zone 'UTC')::date`
  );
  const currentGlobalCount = Number(currentBudget.rows[0].count);
  const reserve = (emailKey: string, ipKey: string) =>
    runtime.query(
      `select status, global_count
         from public.reserve_otp_send_budget($1, $2, 1, 10, $3, $4)`,
      [
        digest(emailKey),
        digest(ipKey),
        currentGlobalCount + 1,
        currentGlobalCount + 2
      ]
    );
  const firstBudget = await reserve(`email-1-${suffix}`, `ip-1-${suffix}`);
  assert.equal(firstBudget.rows[0].status, "allowed_warn");
  const emailLimited = await reserve(`email-1-${suffix}`, `ip-2-${suffix}`);
  assert.equal(emailLimited.rows[0].status, "email_limited");
  const secondBudget = await reserve(`email-2-${suffix}`, `ip-2-${suffix}`);
  assert.equal(secondBudget.rows[0].status, "allowed_warn");
  const budgetExhausted = await reserve(`email-3-${suffix}`, `ip-3-${suffix}`);
  assert.equal(budgetExhausted.rows[0].status, "budget_exhausted");

  const owner =
    concurrent[0].status === "fulfilled" ? userA : userB;
  const other = owner === userA ? userB : userA;
  const createSession = (idempotencyKey: string) =>
    withIdentity(owner, (db) =>
      db.query(
        `select *
           from public.create_interview_session(
             $1, 'fixture persisted resume', 'fixture persisted jd',
             'strictHr', $2::uuid, '2026-07', false
           )`,
        [owner, idempotencyKey]
      )
    );
  const replayKey = crypto.randomUUID();
  const replayedCreates = await Promise.all([
    createSession(replayKey),
    createSession(replayKey)
  ]);
  assert.equal(
    replayedCreates[0].rows[0].session_id,
    replayedCreates[1].rows[0].session_id
  );
  const quotaAfterReplay = await admin.query(
    `select session_limit, sessions_started
       from public.user_profiles
      where user_id = $1`,
    [owner]
  );
  assert.equal(quotaAfterReplay.rows[0].session_limit, 3);
  assert.equal(quotaAfterReplay.rows[0].sessions_started, 1);
  const startEvents = await admin.query(
    `select count(*)::int as count
       from public.product_events
      where user_id = $1 and event_name = 'session_started'`,
    [owner]
  );
  assert.equal(startEvents.rows[0].count, 1);

  await createSession(crypto.randomUUID());
  await createSession(crypto.randomUUID());
  await assert.rejects(
    createSession(crypto.randomUUID()),
    /SESSION_QUOTA_EXHAUSTED/
  );
  const quotaAfterExhaustion = await admin.query(
    `select sessions_started
       from public.user_profiles
      where user_id = $1`,
    [owner]
  );
  assert.equal(quotaAfterExhaustion.rows[0].sessions_started, 3);

  await withIdentity(owner, async (db) => {
    const continuation = await db.query(
      `update public.interview_sessions
          set status = 'profile_ready', version = version + 1
        where id = $1`,
      [replayedCreates[0].rows[0].session_id]
    );
    assert.equal(continuation.rowCount, 1);
  });

  await admin.query(
    `insert into public.interview_sessions(
      user_id, school_id, resume_text, jd_text, interviewer_style_id, idempotency_key
    ) values
      ($1, $3, 'fixture resume A', 'fixture jd A', 'strictHr', gen_random_uuid()),
      ($2, $3, 'fixture resume B', 'fixture jd B', 'techBro', gen_random_uuid())`,
    [owner, other, schoolId]
  );

  const ownRows = await withIdentity(owner, (db) =>
    db.query("select user_id from public.interview_sessions order by user_id")
  );
  assert.ok((ownRows.rowCount ?? 0) >= 4);
  assert.ok(ownRows.rows.every((row) => row.user_id === owner));

  await withIdentity(owner, async (db) => {
    const update = await db.query(
      "update public.interview_sessions set status = 'profile_ready' where user_id = $1",
      [other]
    );
    assert.equal(update.rowCount, 0);
  });

  const noLeakedContext = await runtime.query(
    "select count(*)::int as count from public.interview_sessions"
  );
  assert.equal(noLeakedContext.rows[0].count, 0);

  console.log(
    JSON.stringify({
      ok: true,
      authTables: 6,
      businessTables: 9,
      concurrentInviteSuccesses: 1,
      invitePrecheckStatuses: ["valid", "invalid", "expired", "exhausted"],
      otpBudgetStatuses: ["allowed_warn", "email_limited", "budget_exhausted"],
      sessionEntitlement: { limit: 3, started: 0 },
      sessionCreateReplay: { sessions: 1, quotaUsed: 1, startEvents: 1 },
      sessionQuotaExhaustion: { limit: 3, started: 3, existingSessionContinues: true },
      rlsOwnerRows: ownRows.rowCount,
      leakedRowsAfterPoolReuse: 0
    })
  );
}

void main().finally(async () => {
  await Promise.all([admin.end(), runtime.end()]);
});
