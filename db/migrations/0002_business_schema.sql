set local search_path = public, auth;

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.app_user_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')
$$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
as $$
  select current_setting('app.is_admin', true) = 'true'
$$;

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  email_domains text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  code_hash text not null unique,
  label text not null,
  max_uses integer not null check (max_uses >= 0),
  used_count integer not null default 0 check (used_count >= 0 and used_count <= max_uses),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by text not null references auth."user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_profiles (
  user_id text primary key references auth."user"(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  invite_code_id uuid not null references public.invite_codes(id),
  email_normalized text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active'
    check (status in ('active', 'blocked', 'deletion_pending', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references auth."user"(id) on delete cascade,
  policy_version text not null,
  consent_scope text[] not null,
  accepted_at timestamptz not null,
  withdrawn_at timestamptz,
  request_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, policy_version)
);

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references auth."user"(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  status text not null default 'draft'
    check (status in (
      'draft', 'profile_ready', 'questions_ready', 'in_progress',
      'report_ready', 'completed', 'abandoned'
    )),
  version integer not null default 1 check (version >= 1),
  schema_version integer not null default 1 check (schema_version >= 1),
  resume_text text not null,
  jd_text text not null,
  interviewer_style_id text not null
    check (interviewer_style_id in ('strictHr', 'techBro', 'gentleSister')),
  candidate_profile jsonb,
  questions jsonb,
  report jsonb,
  generation_source text not null default 'llm'
    check (generation_source in ('llm', 'demo_fallback', 'mixed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  user_id text not null references auth."user"(id) on delete cascade,
  question_id text not null,
  answer_text text not null,
  input_mode text not null check (input_mode in ('voice', 'text', 'edited')),
  duration_sec integer not null default 0 check (duration_sec between 0 and 7200),
  stt_status text not null
    check (stt_status in ('idle', 'recording', 'success', 'failed', 'unsupported', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, question_id)
);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.interview_sessions(id) on delete cascade,
  user_id text not null references auth."user"(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now()
);

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id text references auth."user"(id) on delete set null,
  school_id uuid references public.schools(id) on delete set null,
  session_id uuid references public.interview_sessions(id) on delete set null,
  event_name text not null,
  source text not null check (source in ('server', 'client')),
  idempotency_key text,
  properties jsonb not null default '{}',
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index product_events_idempotency_idx
  on public.product_events(user_id, event_name, idempotency_key)
  where idempotency_key is not null;

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references auth."user"(id),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'executing', 'completed', 'failed', 'rejected')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  handled_by text references auth."user"(id),
  reason text,
  failure_code text,
  audit_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index interview_sessions_user_created_idx
  on public.interview_sessions(user_id, created_at desc);
create index interview_sessions_school_status_created_idx
  on public.interview_sessions(school_id, status, created_at);
create index product_events_name_occurred_idx
  on public.product_events(event_name, occurred_at);
create index feedback_school_created_idx
  on public.feedback(school_id, created_at);
create index deletion_requests_status_requested_idx
  on public.deletion_requests(status, requested_at);

create trigger schools_touch_updated_at
before update on public.schools
for each row execute function public.touch_updated_at();
create trigger invite_codes_touch_updated_at
before update on public.invite_codes
for each row execute function public.touch_updated_at();
create trigger user_profiles_touch_updated_at
before update on public.user_profiles
for each row execute function public.touch_updated_at();
create trigger interview_sessions_touch_updated_at
before update on public.interview_sessions
for each row execute function public.touch_updated_at();
create trigger interview_answers_touch_updated_at
before update on public.interview_answers
for each row execute function public.touch_updated_at();
create trigger deletion_requests_touch_updated_at
before update on public.deletion_requests
for each row execute function public.touch_updated_at();

create or replace function public.consume_invite_code(
  p_code_hash text,
  p_user_id text,
  p_email_normalized text
)
returns public.user_profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  selected_invite public.invite_codes%rowtype;
  result public.user_profiles%rowtype;
begin
  select * into result from public.user_profiles where user_id = p_user_id;
  if found then
    return result;
  end if;

  select *
  into selected_invite
  from public.invite_codes
  where code_hash = p_code_hash
  for update;

  if not found or selected_invite.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'INVITE_INVALID';
  end if;
  if selected_invite.expires_at is not null and selected_invite.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'INVITE_EXPIRED';
  end if;
  if selected_invite.used_count >= selected_invite.max_uses then
    raise exception using errcode = 'P0001', message = 'INVITE_EXHAUSTED';
  end if;

  update public.invite_codes
  set used_count = used_count + 1
  where id = selected_invite.id;

  insert into public.user_profiles(
    user_id, school_id, invite_code_id, email_normalized
  )
  values (
    p_user_id, selected_invite.school_id, selected_invite.id, lower(trim(p_email_normalized))
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.consume_invite_code(text, text, text) from public;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'schools', 'invite_codes', 'user_profiles', 'consent_records',
    'interview_sessions', 'interview_answers', 'feedback',
    'product_events', 'deletion_requests'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

create policy schools_user_read on public.schools
for select using (
  public.app_is_admin() or exists (
    select 1 from public.user_profiles p
    where p.user_id = public.app_user_id() and p.school_id = schools.id
  )
);
create policy schools_admin_write on public.schools
for all using (public.app_is_admin()) with check (public.app_is_admin());

create policy invite_codes_admin_only on public.invite_codes
for all using (public.app_is_admin()) with check (public.app_is_admin());

create policy user_profiles_owner_read on public.user_profiles
for select using (public.app_is_admin() or user_id = public.app_user_id());
create policy user_profiles_admin_write on public.user_profiles
for all using (public.app_is_admin()) with check (public.app_is_admin());

create policy consent_records_owner on public.consent_records
for all
using (public.app_is_admin() or user_id = public.app_user_id())
with check (public.app_is_admin() or user_id = public.app_user_id());

create policy interview_sessions_owner on public.interview_sessions
for all
using (public.app_is_admin() or user_id = public.app_user_id())
with check (public.app_is_admin() or user_id = public.app_user_id());

create policy interview_answers_owner on public.interview_answers
for all
using (public.app_is_admin() or user_id = public.app_user_id())
with check (public.app_is_admin() or user_id = public.app_user_id());

create policy feedback_owner on public.feedback
for all
using (public.app_is_admin() or user_id = public.app_user_id())
with check (public.app_is_admin() or user_id = public.app_user_id());

create policy product_events_server on public.product_events
for all
using (public.app_is_admin() or user_id = public.app_user_id())
with check (
  public.app_is_admin() or
  (user_id = public.app_user_id() and event_name in (
    'page_viewed', 'login_started', 'consent_viewed', 'session_started',
    'session_completed', 'feedback_submitted'
  ))
);

create policy deletion_requests_owner on public.deletion_requests
for all
using (public.app_is_admin() or user_id = public.app_user_id())
with check (public.app_is_admin() or user_id = public.app_user_id());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'passbuddy_app') then
    grant usage on schema public to passbuddy_app;
    grant select, insert, update, delete on all tables in schema public to passbuddy_app;
    grant usage, select on all sequences in schema public to passbuddy_app;
    grant execute on function public.consume_invite_code(text, text, text) to passbuddy_app;
  end if;
end;
$$;
