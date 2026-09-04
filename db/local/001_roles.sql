-- Local Docker Compose credentials only. Production roles are provisioned separately.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'forecast_app') then
    alter role forecast_app login password 'local_only';
  else
    create role forecast_app login password 'local_only';
  end if;

  if exists (select 1 from pg_roles where rolname = 'forecast_indexer') then
    alter role forecast_indexer login password 'local_only';
  else
    create role forecast_indexer login password 'local_only';
  end if;
end
$$;
