import "server-only";

import { withAdminTransaction } from "@/lib/db/context";

export interface AdminMetricsFilter {
  from: Date;
  to: Date;
  schoolId: string | null;
}

export async function getAdminMetrics(filter: AdminMetricsFilter) {
  return withAdminTransaction(async (client) => {
    const params = [filter.from, filter.to, filter.schoolId];
    const users = await client.query(
          `select
             count(*)::int as registered,
             count(*) filter (where p.status = 'active')::int as active
           from auth."user" u
           left join public.user_profiles p on p.user_id = u.id
          where u."createdAt" >= $1 and u."createdAt" < $2
            and ($3::uuid is null or p.school_id = $3)`,
          params
        );
    const sessions = await client.query(
          `select
             count(*)::int as started,
             count(*) filter (where status = 'completed')::int as completed,
             count(*) filter (where generation_source in ('demo_fallback', 'mixed'))::int as fallback
           from public.interview_sessions
          where created_at >= $1 and created_at < $2
            and ($3::uuid is null or school_id = $3)`,
          params
        );
    const failures = await client.query(
          `select count(*)::int as count
             from public.product_events
            where event_name = 'dependency_failed'
              and occurred_at >= $1 and occurred_at < $2
              and ($3::uuid is null or school_id = $3)`,
          params
        );
    const feedback = await client.query(
          `select count(*)::int as count,
                  coalesce(round(avg(rating)::numeric, 2), 0) as average_rating
             from public.feedback
            where created_at >= $1 and created_at < $2
              and ($3::uuid is null or school_id = $3)`,
          params
        );
    const quota = await client.query(
          `select coalesce(sum(session_limit), 0)::int as granted,
                  coalesce(sum(sessions_started), 0)::int as used
             from public.user_profiles
            where status in ('active', 'deletion_pending')
              and ($1::uuid is null or school_id = $1)`,
          [filter.schoolId]
        );
    const deletion = await client.query(
          `select count(*) filter (
                    where status in ('requested', 'approved', 'executing', 'failed')
                  )::int as pending
             from public.deletion_requests
            where requested_at >= $1 and requested_at < $2`,
          params.slice(0, 2)
        );
    const usage = await client.query(
          `select
             sum(
               case when jsonb_typeof(properties->'inputTokens') = 'number'
                 then (properties->>'inputTokens')::bigint else 0 end
             )::bigint as input_tokens,
             sum(
               case when jsonb_typeof(properties->'outputTokens') = 'number'
                 then (properties->>'outputTokens')::bigint else 0 end
             )::bigint as output_tokens
           from public.product_events
          where event_name in ('profile_generated', 'questions_generated', 'report_generated')
            and occurred_at >= $1 and occurred_at < $2
            and ($3::uuid is null or school_id = $3)`,
          params
        );
    const latency = await client.query(
          `select count(*)::int as count,
                  count(*) filter (where status_code >= 500)::int as errors,
                  coalesce(round(percentile_cont(0.5) within group (order by duration_ms))::int, 0) as p50_ms,
                  coalesce(round(percentile_cont(0.95) within group (order by duration_ms))::int, 0) as p95_ms
             from public.api_request_metrics
            where occurred_at >= $1 and occurred_at < $2`,
          params.slice(0, 2)
        );

    const started = Number(sessions.rows[0].started);
    const completed = Number(sessions.rows[0].completed);
    const quotaGranted = Number(quota.rows[0].granted);
    const quotaUsed = Number(quota.rows[0].used);
    return {
      range: {
        from: filter.from.toISOString(),
        to: filter.to.toISOString(),
        schoolId: filter.schoolId
      },
      users: {
        registered: Number(users.rows[0].registered),
        active: Number(users.rows[0].active)
      },
      sessions: {
        started,
        completed,
        completionRate: started ? completed / started : 0,
        dependencyFailures: Number(failures.rows[0].count),
        fallback: Number(sessions.rows[0].fallback)
      },
      feedback: {
        count: Number(feedback.rows[0].count),
        averageRating: Number(feedback.rows[0].average_rating)
      },
      quota: {
        granted: quotaGranted,
        used: quotaUsed,
        remaining: Math.max(0, quotaGranted - quotaUsed)
      },
      usage: {
        inputTokens: Number(usage.rows[0].input_tokens ?? 0),
        outputTokens: Number(usage.rows[0].output_tokens ?? 0),
        measuredFromEvents: true
      },
      deletions: { pending: Number(deletion.rows[0].pending) },
      apiLatency: {
        scope: "global",
        count: Number(latency.rows[0].count),
        errors: Number(latency.rows[0].errors),
        p50Ms: Number(latency.rows[0].p50_ms),
        p95Ms: Number(latency.rows[0].p95_ms)
      }
    };
  });
}
