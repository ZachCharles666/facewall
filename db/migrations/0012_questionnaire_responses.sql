begin;

create table public.questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.interview_sessions(id) on delete cascade,
  user_id text not null unique references auth."user"(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  questionnaire_version text not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  created_at timestamptz not null default now()
);

create index questionnaire_responses_school_created_idx
  on public.questionnaire_responses(school_id, created_at desc);

alter table public.questionnaire_responses enable row level security;
alter table public.questionnaire_responses force row level security;

create policy questionnaire_responses_owner on public.questionnaire_responses
for all
using (public.app_is_admin() or user_id = public.app_user_id())
with check (public.app_is_admin() or user_id = public.app_user_id());

drop policy if exists product_events_server on public.product_events;
create policy product_events_server on public.product_events
for all
using (public.app_is_admin() or user_id = public.app_user_id())
with check (
  public.app_is_admin() or
  (
    user_id = public.app_user_id() and
    source = 'server' and
    event_name in (
      'session_started', 'profile_generated', 'questions_generated',
      'answer_saved', 'report_generated', 'session_completed',
      'feedback_submitted', 'questionnaire_submitted', 'dependency_failed'
    )
  ) or
  (
    user_id = public.app_user_id() and
    source = 'client' and
    event_name in (
      'page_viewed', 'consent_viewed', 'report_viewed',
      'copy_succeeded', 'copy_failed', 'feedback_skipped',
      'questionnaire_invite_viewed', 'questionnaire_started'
    )
  )
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'passbuddy_app') then
    grant select, insert on public.questionnaire_responses to passbuddy_app;
  end if;
end;
$$;

commit;

