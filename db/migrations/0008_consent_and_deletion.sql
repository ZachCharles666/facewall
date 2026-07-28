set local search_path = public, auth;

drop policy if exists consent_records_owner on public.consent_records;

create policy consent_records_owner_read on public.consent_records
for select
using (public.app_is_admin() or user_id = public.app_user_id());

create policy consent_records_owner_insert on public.consent_records
for insert
with check (user_id = public.app_user_id());

alter table public.deletion_requests
  drop constraint deletion_requests_user_id_fkey;

alter table public.deletion_requests
  alter column user_id drop not null;

alter table public.deletion_requests
  add constraint deletion_requests_user_id_fkey
  foreign key (user_id) references auth."user"(id) on delete set null;

create unique index deletion_requests_user_active_idx
  on public.deletion_requests(user_id)
  where user_id is not null
    and status in ('requested', 'approved', 'executing');
