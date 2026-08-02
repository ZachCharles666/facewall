-- Run once with a provider-level database owner before application migrations.
-- Login credentials are created by the cloud control plane or secret manager; this
-- repository only defines the least-privilege group role used by DATABASE_URL.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'passbuddy_app') then
    create role passbuddy_app nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end;
$$;
