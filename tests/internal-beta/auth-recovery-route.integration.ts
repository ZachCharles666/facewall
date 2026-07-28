import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";

import { hashInviteCode } from "../../lib/auth/challenge";

loadEnvConfig(process.cwd());

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim();
const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
if (!adminUrl || !authSecret) {
  throw new Error("DATABASE_ADMIN_URL and BETTER_AUTH_SECRET are required");
}
const fixtureSecret = authSecret;

Object.assign(process.env, {
  NODE_ENV: "development",
  INTERNAL_BETA_AUTH_ENABLED: "true",
  INTERNAL_BETA_REQUIRE_CONSENT: "true",
  INTERNAL_BETA_BROWSER_FIXTURES: "true"
});

const pool = new Pool({
  connectionString: adminUrl,
  application_name: "ib07-auth-recovery-route"
});

function signedSessionCookie(token: string) {
  const signature = createHmac("sha256", authSecret!).update(token).digest("base64");
  const value = encodeURIComponent(`${token}.${signature}`);
  return [
    `better-auth.session_token=${value}`,
    `__Secure-better-auth.session_token=${value}`
  ].join("; ");
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const userId = `ib07-recovery-${suffix}`;
  const token = randomUUID();
  const inviteCode = `PB-RECOVERY-${suffix}`;
  let schoolId = "";
  let inviteId = "";
  const requestIds: string[] = [];

  try {
    await pool.query(
      `insert into auth."user"(
         id, name, email, "emailVerified", "createdAt", "updatedAt"
       ) values ($1, $1, $2, true, now(), now())`,
      [userId, `${userId}@example.test`]
    );
    await pool.query(
      `insert into auth.session(
         id, "expiresAt", token, "createdAt", "updatedAt", "userId"
       ) values ($1, now() + interval '1 hour', $2, now(), now(), $3)`,
      [randomUUID(), token, userId]
    );
    const school = await pool.query(
      `insert into public.schools(code, name)
       values ($1, 'IB07 Recovery') returning id`,
      [`ib07-recovery-${suffix}`]
    );
    schoolId = String(school.rows[0].id);
    const invite = await pool.query(
      `insert into public.invite_codes(
         school_id, code_hash, label, max_uses, created_by
       ) values ($1, $2, 'ib07-recovery', 1, $3) returning id`,
      [schoolId, hashInviteCode(inviteCode, fixtureSecret), userId]
    );
    inviteId = String(invite.rows[0].id);

    const cookie = signedSessionCookie(token);
    const { POST: redeemInvite } = await import(
      "../../app/api/auth/redeem-invite/route"
    );
    const { GET: getSession } = await import(
      "../../app/api/auth/session/route"
    );

    const failed = await redeemInvite(
      new Request("http://localhost/api/auth/redeem-invite", {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
          "x-facewall-fault": "database",
          "x-forwarded-for": "192.0.2.80"
        },
        body: JSON.stringify({ inviteCode })
      })
    );
    const failedBody = await failed.json();
    requestIds.push(String(failedBody.requestId));
    assert.equal(failed.status, 500);
    assert.equal(failedBody.error?.code, "PROFILE_INIT_FAILED");
    assert.equal(failedBody.error?.retryable, true);

    const afterFailure = await pool.query(
      `select
         (select used_count from public.invite_codes where id = $1)::int as used_count,
         (select count(*) from public.user_profiles where user_id = $2)::int as profiles`,
      [inviteId, userId]
    );
    assert.equal(afterFailure.rows[0].used_count, 0);
    assert.equal(afterFailure.rows[0].profiles, 0);

    const restrictedSession = await getSession(
      new Request("http://localhost/api/auth/session", {
        headers: { cookie }
      })
    );
    const restrictedBody = await restrictedSession.json();
    requestIds.push(String(restrictedBody.requestId));
    assert.equal(restrictedSession.status, 200);
    assert.equal(restrictedBody.data?.needsInvite, true);

    const retried = await redeemInvite(
      new Request("http://localhost/api/auth/redeem-invite", {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
          "x-forwarded-for": "192.0.2.80"
        },
        body: JSON.stringify({ inviteCode })
      })
    );
    const retriedBody = await retried.json();
    requestIds.push(String(retriedBody.requestId));
    assert.equal(retried.status, 200);
    assert.equal(retriedBody.data?.needsInvite, false);

    const afterRetry = await pool.query(
      `select
         (select used_count from public.invite_codes where id = $1)::int as used_count,
         (select count(*) from public.user_profiles where user_id = $2)::int as profiles`,
      [inviteId, userId]
    );
    assert.equal(afterRetry.rows[0].used_count, 1);
    assert.equal(afterRetry.rows[0].profiles, 1);

    console.log(JSON.stringify({
      ok: true,
      failure: {
        code: "PROFILE_INIT_FAILED",
        inviteUses: 0,
        profiles: 0,
        remainsRestricted: true
      },
      retry: {
        inviteUses: 1,
        profiles: 1,
        needsInvite: false
      }
    }));
  } finally {
    if (requestIds.length > 0) {
      await pool.query(
        `delete from public.api_request_metrics where request_id = any($1::text[])`,
        [requestIds]
      ).catch(() => undefined);
    }
    await pool.query(
      `delete from auth.write_rate_limit_counters
        where route = '/api/auth/redeem-invite' and updated_at >= now() - interval '5 minutes'`
    ).catch(() => undefined);
    await pool.query(
      `delete from public.user_profiles where user_id = $1`,
      [userId]
    ).catch(() => undefined);
    if (inviteId) {
      await pool.query(
        `delete from public.invite_codes where id = $1`,
        [inviteId]
      ).catch(() => undefined);
    }
    if (schoolId) {
      await pool.query(
        `delete from public.schools where id = $1`,
        [schoolId]
      ).catch(() => undefined);
    }
    await pool.query(
      `delete from auth."user" where id = $1`,
      [userId]
    ).catch(() => undefined);
    await pool.end();
    await globalThis.__passbuddyRuntimePool?.end().catch(() => undefined);
    globalThis.__passbuddyRuntimePool = undefined;
    await globalThis.__passbuddyAdminPool?.end().catch(() => undefined);
    globalThis.__passbuddyAdminPool = undefined;
  }
}

void main();
