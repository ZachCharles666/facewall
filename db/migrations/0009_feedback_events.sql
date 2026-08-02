set local search_path = public, auth;

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
      'feedback_submitted', 'dependency_failed'
    )
  ) or
  (
    user_id = public.app_user_id() and
    source = 'client' and
    event_name in (
      'page_viewed', 'consent_viewed', 'report_viewed',
      'copy_succeeded', 'copy_failed', 'feedback_skipped'
    )
  )
);
