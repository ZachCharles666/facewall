set local search_path = public, auth;

create table auth.otp_send_counters (
  scope_type text not null check (scope_type in ('email', 'ip', 'global')),
  scope_hash text not null,
  bucket_date date not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope_type, scope_hash, bucket_date)
);

create or replace function public.reserve_otp_send_budget(
  p_email_hash text,
  p_ip_hash text,
  p_email_limit integer,
  p_ip_limit integer,
  p_global_warn_limit integer,
  p_global_stop_limit integer
)
returns table(status text, global_count integer)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  bucket date := (now() at time zone 'UTC')::date;
  email_count integer;
  ip_count integer;
  total_count integer;
begin
  if p_email_limit <= 0 or p_ip_limit <= 0 or
     p_global_warn_limit <= 0 or p_global_stop_limit <= p_global_warn_limit then
    raise exception using errcode = '22023', message = 'OTP_BUDGET_CONFIG_INVALID';
  end if;
  if p_email_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'OTP_BUDGET_KEY_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('passbuddy-otp-budget-' || bucket::text));

  select coalesce(max(attempt_count), 0) into email_count
  from auth.otp_send_counters
  where scope_type = 'email' and scope_hash = p_email_hash and bucket_date = bucket;

  select coalesce(max(attempt_count), 0) into ip_count
  from auth.otp_send_counters
  where scope_type = 'ip' and scope_hash = p_ip_hash and bucket_date = bucket;

  select coalesce(max(attempt_count), 0) into total_count
  from auth.otp_send_counters
  where scope_type = 'global' and scope_hash = 'daily' and bucket_date = bucket;

  if email_count >= p_email_limit then
    return query select 'email_limited'::text, total_count;
    return;
  end if;
  if ip_count >= p_ip_limit then
    return query select 'ip_limited'::text, total_count;
    return;
  end if;
  if total_count >= p_global_stop_limit then
    return query select 'budget_exhausted'::text, total_count;
    return;
  end if;

  insert into auth.otp_send_counters(scope_type, scope_hash, bucket_date, attempt_count)
  values
    ('email', p_email_hash, bucket, 1),
    ('ip', p_ip_hash, bucket, 1),
    ('global', 'daily', bucket, 1)
  on conflict (scope_type, scope_hash, bucket_date)
  do update set
    attempt_count = auth.otp_send_counters.attempt_count + 1,
    updated_at = now();

  total_count := total_count + 1;
  return query select
    case when total_count >= p_global_warn_limit then 'allowed_warn' else 'allowed' end,
    total_count;
end;
$$;

revoke all on table auth.otp_send_counters from public;
revoke all on function public.reserve_otp_send_budget(text, text, integer, integer, integer, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'passbuddy_app') then
    grant usage on schema auth to passbuddy_app;
    grant execute on function public.reserve_otp_send_budget(
      text, text, integer, integer, integer, integer
    ) to passbuddy_app;
  end if;
end;
$$;
