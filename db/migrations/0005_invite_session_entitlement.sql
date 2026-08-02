set local search_path = public, auth;

alter table public.invite_codes
  add column session_limit_per_user integer not null default 3
  check (session_limit_per_user between 1 and 100);

alter table public.user_profiles
  add column session_limit integer not null default 3
  check (session_limit between 1 and 100),
  add column sessions_started integer not null default 0
  check (sessions_started >= 0 and sessions_started <= session_limit);

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
    user_id, school_id, invite_code_id, email_normalized, session_limit
  )
  values (
    p_user_id, selected_invite.school_id, selected_invite.id,
    lower(trim(p_email_normalized)), selected_invite.session_limit_per_user
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.consume_invite_code(text, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'passbuddy_app') then
    grant execute on function public.consume_invite_code(text, text, text) to passbuddy_app;
  end if;
end;
$$;
