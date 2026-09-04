begin;

grant usage,select on all sequences in schema public to forecast_app,forecast_indexer;
grant select,insert on order_state_history to forecast_app;
grant update(block_number,block_hash,canonical,orphaned_at) on raw_events to forecast_indexer;
grant delete on market_reserves to forecast_indexer;

create or replace function authenticate_app_user(p_privy_did text)
returns table(id uuid,privy_did text,role app_role)
language sql
security definer
set search_path = pg_catalog
as $$
  insert into public.app_users(privy_did)
  values(p_privy_did)
  on conflict(privy_did) do update set last_seen_at=now()
  returning app_users.id,app_users.privy_did,app_users.role
$$;
revoke all on function authenticate_app_user(text) from public;
grant execute on function authenticate_app_user(text) to forecast_app;

create policy orders_self_insert on orders for insert to forecast_app
with check(user_id=current_setting('app.user_id',true)::uuid);
create policy orders_self_update on orders for update to forecast_app
using(user_id=current_setting('app.user_id',true)::uuid)
with check(user_id=current_setting('app.user_id',true)::uuid);
create policy orders_indexer_all on orders for all to forecast_indexer
using(true) with check(true);

commit;
