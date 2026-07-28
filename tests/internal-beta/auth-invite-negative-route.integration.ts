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
  INTERNAL_BETA_REQUIRE_CONSENT: "true"
});

const pool = new Pool({
  connectionString: adminUrl,
  application_name: "ib07-auth-invite-negative"
});

function signedSessionCookie(token: string) {
  const signature = createHmac("sha256", authSecret!).update(token).digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const cases = [
    { name: "invalid", expectedCode: "INVITE_INVALID", expectedStatus: 400 },
    { name: "expired", expectedCode: "INVITE_EXPIRED", expectedStatus: 400 },
    { name: "disabled", expectedCode: "INVITE_INVALID", expectedStatus: 400 },
    { name: "exhausted", expectedCode: "INVITE_EXHAUSTED", expectedStatus: 409 }
  ] as const;
  const fixtures = cases.map((item) => ({
    ...item,
    userId: `ib07-${item.name}-${suffix}`,
    token: randomUUID(),
    inviteCode: `PB-${item.name.toUpperCase()}-${suffix}`
  }));
  const userIds = fixtures.map((item) => item.userId);
  const requestIds: string[] = [];
  let schoolId = "";

  try {
    for (const fixture of fixtures) {
      await pool.query(
        `insert into auth."user"(
           id, name, email, "emailVerified", "createdAt", "updatedAt"
         ) values ($1, $1, $2, true, now(), now())`,
        [fixture.userId, `${fixture.userId}@example.test`]
      );
      await pool.query(
        `insert into auth.session(
           id, "expiresAt", token, "createdAt", "updatedAt", "userId"
         ) values ($1, now() + interval '1 hour', $2, now(), now(), $3)`,
        [randomUUID(), fixture.token, fixture.userId]
      );
    }

    const school = await pool.query(
      `insert into public.schools(code, name)
       values ($1, 'IB07 Invite Negative') returning id`,
      [`ib07-invite-negative-${suffix}`]
    );
    schoolId = String(school.rows[0].id);
    for (const fixture of fixtures.filter((item) => item.name !== "invalid")) {
      await pool.query(
        `insert into public.invite_codes(
           school_id, code_hash, label, max_uses, used_count,
           expires_at, status, created_by
         ) values (
           $1, $2, $3, 1, $4,
           case when $3 = 'expired' then now() - interval '1 minute' else null end,
           case when $3 = 'disabled' then 'disabled' else 'active' end,
           $5
         )`,
        [
          schoolId,
          hashInviteCode(fixture.inviteCode, fixtureSecret),
          fixture.name,
          fixture.name === "exhausted" ? 1 : 0,
          fixtures[0].userId
        ]
      );
    }

    const { POST: redeemInvite } = await import(
      "../../app/api/auth/redeem-invite/route"
    );
    for (const [index, fixture] of fixtures.entries()) {
      const response = await redeemInvite(
        new Request("http://localhost/api/auth/redeem-invite", {
          method: "POST",
          headers: {
            cookie: signedSessionCookie(fixture.token),
            "content-type": "application/json",
            "x-forwarded-for": `192.0.2.${100 + index}`
          },
          body: JSON.stringify({ inviteCode: fixture.inviteCode })
        })
      );
      const body = await response.json();
      requestIds.push(String(body.requestId));
      assert.equal(response.status, fixture.expectedStatus);
      assert.equal(body.error?.code, fixture.expectedCode);
    }

    const reconciliation = await pool.query(
      `select
         (select count(*) from public.user_profiles where user_id = any($1::text[]))::int
           as profiles,
         coalesce(sum(used_count) filter (where label <> 'exhausted'), 0)::int
           as unexpected_uses,
         coalesce(max(used_count) filter (where label = 'exhausted'), 0)::int
           as exhausted_uses
       from public.invite_codes
      where school_id = $2`,
      [userIds, schoolId]
    );
    assert.equal(reconciliation.rows[0].profiles, 0);
    assert.equal(reconciliation.rows[0].unexpected_uses, 0);
    assert.equal(reconciliation.rows[0].exhausted_uses, 1);

    console.log(JSON.stringify({
      ok: true,
      statuses: {
        invalid: 400,
        expired: 400,
        disabled: 400,
        exhausted: 409
      },
      sideEffects: {
        profilesCreated: 0,
        inviteCountersAdvanced: 0
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
      `delete from public.user_profiles where user_id = any($1::text[])`,
      [userIds]
    ).catch(() => undefined);
    if (schoolId) {
      await pool.query(
        `delete from public.invite_codes where school_id = $1`,
        [schoolId]
      ).catch(() => undefined);
      await pool.query(
        `delete from public.schools where id = $1`,
        [schoolId]
      ).catch(() => undefined);
    }
    await pool.query(
      `delete from auth."user" where id = any($1::text[])`,
      [userIds]
    ).catch(() => undefined);
    await pool.end();
    await globalThis.__passbuddyRuntimePool?.end().catch(() => undefined);
    globalThis.__passbuddyRuntimePool = undefined;
    await globalThis.__passbuddyAdminPool?.end().catch(() => undefined);
    globalThis.__passbuddyAdminPool = undefined;
  }
}

void main();
