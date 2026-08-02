begin;

create table auth.write_rate_limit_counters (
  scope_hash text not null check (scope_hash ~ '^[a-f0-9]{64}$'),
  route text not null,
  method text not null,
  window_started_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope_hash, route, method, window_started_at)
);

create index write_rate_limit_counters_updated_idx
  on auth.write_rate_limit_counters(updated_at);

create or replace function public.reserve_write_rate_limit(
  p_scope_hash text,
  p_route text,
  p_method text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer, attempt_count integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  bucket timestamptz;
  current_count integer;
  retry_seconds integer;
begin
  if p_scope_hash !~ '^[a-f0-9]{64}$' or
     p_route is null or char_length(p_route) < 1 or char_length(p_route) > 160 or
     p_method not in ('POST', 'PUT', 'PATCH', 'DELETE') or
     p_limit < 1 or p_limit > 10000 or
     p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'WRITE_RATE_LIMIT_INPUT_INVALID';
  end if;

  bucket := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into auth.write_rate_limit_counters(
    scope_hash, route, method, window_started_at, attempt_count
  )
  values (p_scope_hash, p_route, p_method, bucket, 1)
  on conflict (scope_hash, route, method, window_started_at)
  do update set
    attempt_count = auth.write_rate_limit_counters.attempt_count + 1,
    updated_at = now()
  returning auth.write_rate_limit_counters.attempt_count into current_count;

  retry_seconds := greatest(
    1,
    ceil(extract(epoch from (
      bucket + make_interval(secs => p_window_seconds) - clock_timestamp()
    )))::integer
  );

  return query select
    current_count <= p_limit,
    retry_seconds,
    current_count;
end;
$$;

revoke all on table auth.write_rate_limit_counters from public;
revoke all on function public.reserve_write_rate_limit(
  text, text, text, integer, integer
) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'passbuddy_app') then
    grant usage on schema auth to passbuddy_app;
    grant execute on function public.reserve_write_rate_limit(
      text, text, text, integer, integer
    ) to passbuddy_app;
  end if;
end;
$$;

commit;
