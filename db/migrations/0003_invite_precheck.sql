set local search_path = public, auth;

create or replace function public.check_invite_code(p_code_hash text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  selected_invite public.invite_codes%rowtype;
begin
  select *
  into selected_invite
  from public.invite_codes
  where code_hash = p_code_hash;

  if not found or selected_invite.status <> 'active' then
    return 'invalid';
  end if;
  if selected_invite.expires_at is not null and selected_invite.expires_at <= now() then
    return 'expired';
  end if;
  if selected_invite.used_count >= selected_invite.max_uses then
    return 'exhausted';
  end if;
  return 'valid';
end;
$$;

revoke all on function public.check_invite_code(text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'passbuddy_app') then
    grant execute on function public.check_invite_code(text) to passbuddy_app;
  end if;
end;
$$;
