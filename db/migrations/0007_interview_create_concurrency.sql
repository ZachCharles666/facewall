set local search_path = public, auth;

create or replace function public.create_interview_session(
  p_user_id text,
  p_resume_text text,
  p_jd_text text,
  p_interviewer_style_id text,
  p_idempotency_key uuid,
  p_policy_version text,
  p_require_consent boolean
)
returns table (
  session_id uuid,
  session_status text,
  session_version integer,
  quota_limit integer,
  quota_used integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  selected_profile public.user_profiles%rowtype;
  selected_session public.interview_sessions%rowtype;
begin
  if p_user_id is null or p_user_id <> public.app_user_id() then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;

  select *
    into selected_session
    from public.interview_sessions
   where user_id = p_user_id
     and idempotency_key = p_idempotency_key;

  if found then
    select *
      into selected_profile
      from public.user_profiles
     where user_id = p_user_id;
    return query
      select selected_session.id, selected_session.status, selected_session.version,
             selected_profile.session_limit, selected_profile.sessions_started;
    return;
  end if;

  select *
    into selected_profile
    from public.user_profiles
   where user_id = p_user_id
   for update;

  if not found or selected_profile.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_UNAVAILABLE';
  end if;

  select *
    into selected_session
    from public.interview_sessions
   where user_id = p_user_id
     and idempotency_key = p_idempotency_key;

  if found then
    return query
      select selected_session.id, selected_session.status, selected_session.version,
             selected_profile.session_limit, selected_profile.sessions_started;
    return;
  end if;

  if p_require_consent and not exists (
    select 1
      from public.consent_records
     where user_id = p_user_id
       and policy_version = p_policy_version
       and withdrawn_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'CONSENT_REQUIRED';
  end if;

  if selected_profile.sessions_started >= selected_profile.session_limit then
    raise exception using errcode = 'P0001', message = 'SESSION_QUOTA_EXHAUSTED';
  end if;

  insert into public.interview_sessions(
    user_id, school_id, resume_text, jd_text, interviewer_style_id,
    idempotency_key, status, version, schema_version, generation_source
  )
  values (
    p_user_id, selected_profile.school_id, p_resume_text, p_jd_text,
    p_interviewer_style_id, p_idempotency_key, 'draft', 1, 1, 'llm'
  )
  returning * into selected_session;

  update public.user_profiles
     set sessions_started = sessions_started + 1
   where user_id = p_user_id
  returning * into selected_profile;

  insert into public.product_events(
    user_id, school_id, session_id, event_name, source,
    idempotency_key, properties, occurred_at
  )
  values (
    p_user_id, selected_profile.school_id, selected_session.id,
    'session_started', 'server', p_idempotency_key::text,
    jsonb_build_object(
      'schemaVersion', selected_session.schema_version,
      'quotaUsed', selected_profile.sessions_started,
      'quotaLimit', selected_profile.session_limit
    ),
    now()
  )
  on conflict do nothing;

  return query
    select selected_session.id, selected_session.status, selected_session.version,
           selected_profile.session_limit, selected_profile.sessions_started;
end;
$$;

revoke all on function public.create_interview_session(
  text, text, text, text, uuid, text, boolean
) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'passbuddy_app') then
    grant execute on function public.create_interview_session(
      text, text, text, text, uuid, text, boolean
    ) to passbuddy_app;
  end if;
end;
$$;
