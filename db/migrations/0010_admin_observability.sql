begin;

create table public.api_request_metrics (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  route text not null,
  method text not null,
  status_code integer not null check (status_code between 100 and 599),
  duration_ms integer not null check (duration_ms >= 0),
  error_code text,
  occurred_at timestamptz not null default now()
);

create index api_request_metrics_route_occurred_idx
  on public.api_request_metrics(route, occurred_at desc);
create index api_request_metrics_status_occurred_idx
  on public.api_request_metrics(status_code, occurred_at desc);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id text,
  request_id text not null,
  action text not null,
  target_type text not null,
  target_id text,
  outcome text not null check (outcome in ('succeeded', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index admin_audit_logs_admin_occurred_idx
  on public.admin_audit_logs(admin_user_id, occurred_at desc);
create index admin_audit_logs_action_occurred_idx
  on public.admin_audit_logs(action, occurred_at desc);

alter table public.api_request_metrics enable row level security;
alter table public.api_request_metrics force row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.admin_audit_logs force row level security;

create policy api_request_metrics_admin_only on public.api_request_metrics
  for all
  using (public.app_is_admin())
  with check (public.app_is_admin());

create policy admin_audit_logs_admin_only on public.admin_audit_logs
  for all
  using (public.app_is_admin())
  with check (public.app_is_admin());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'passbuddy_app') then
    grant select, insert on public.api_request_metrics to passbuddy_app;
    grant select, insert on public.admin_audit_logs to passbuddy_app;
  end if;
end;
$$;

commit;
