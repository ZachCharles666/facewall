create role passbuddy_app
  login
  password 'passbuddy_app_local'
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit;

grant connect on database passbuddy to passbuddy_app;
