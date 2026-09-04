begin;

alter table markets add column if not exists slug text;
alter table markets add column if not exists data_origin text not null default 'CHAIN';
alter table markets add column if not exists demo_liquidity numeric(78,0);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'markets_slug_format') then
    alter table markets add constraint markets_slug_format
      check(slug is null or slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'markets_data_origin_check') then
    alter table markets add constraint markets_data_origin_check
      check(data_origin in ('CHAIN','DEMO'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'markets_probability_range') then
    alter table markets add constraint markets_probability_range
      check(yes_probability_bps between 0 and 10000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'markets_nonnegative_volume') then
    alter table markets add constraint markets_nonnegative_volume check(volume >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'markets_demo_boundary') then
    alter table markets add constraint markets_demo_boundary check(
      (data_origin = 'CHAIN' and demo_liquidity is null)
      or
      (data_origin = 'DEMO' and contract_address is null and confirmed_block is null and demo_liquidity is not null and demo_liquidity >= 0)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_wallets_user_address_unique') then
    alter table user_wallets add constraint user_wallets_user_address_unique unique(user_id,address);
  end if;
end
$$;

create unique index if not exists markets_slug_unique on markets(slug) where slug is not null;
create index if not exists markets_origin_discovery on markets(data_origin,status,close_time,id desc) where canonical;

create table if not exists demo_probability_history(
  market_id uuid not null references markets,
  sequence integer not null check(sequence >= 0),
  observed_at timestamptz not null,
  yes_probability_bps integer not null check(yes_probability_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  primary key(market_id,sequence),
  unique(market_id,observed_at)
);

comment on table demo_probability_history is
  'Development-only probability samples. They never represent confirmed chain events.';

create table if not exists simulation_orders(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users,
  wallet_address text not null,
  market_id uuid not null references markets,
  operation text not null default 'BUY' check(operation = 'BUY'),
  side text not null check(side in ('YES','NO')),
  amount numeric(78,0) not null check(amount > 0),
  execution_price_bps integer not null check(execution_price_bps between 1 and 9999),
  estimated_shares numeric(78,0) not null check(estimated_shares > 0),
  potential_payout numeric(78,0) not null check(potential_payout >= estimated_shares),
  state text not null default 'SIMULATED' check(state = 'SIMULATED'),
  idempotency_key text not null check(length(idempotency_key) between 1 and 128),
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  foreign key(user_id,wallet_address) references user_wallets(user_id,address),
  unique(user_id,idempotency_key)
);

comment on table simulation_orders is
  'Append-only, non-accounting demo records. Inserts never alter balances, chain orders, or positions.';

create index if not exists simulation_orders_user_time on simulation_orders(user_id,created_at desc,id desc);
create index if not exists simulation_orders_market_time on simulation_orders(market_id,created_at desc,id desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'simulation_orders_append_only') then
    create trigger simulation_orders_append_only
      before update or delete on simulation_orders
      for each row execute function reject_mutation();
  end if;
end
$$;

alter table simulation_orders enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'simulation_orders' and policyname = 'simulation_orders_self_select'
  ) then
    create policy simulation_orders_self_select on simulation_orders
      for select to forecast_app
      using(user_id = current_setting('app.user_id',true)::uuid);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'simulation_orders' and policyname = 'simulation_orders_self_insert'
  ) then
    create policy simulation_orders_self_insert on simulation_orders
      for insert to forecast_app
      with check(user_id = current_setting('app.user_id',true)::uuid);
  end if;
end
$$;

create or replace view mvp_market_catalog with (security_invoker = true) as
select
  m.id,
  m.slug,
  m.question,
  m.description,
  m.category,
  m.resolution_source,
  m.rules,
  m.close_time,
  m.status,
  m.yes_probability_bps,
  10000 - m.yes_probability_bps as no_probability_bps,
  m.volume,
  case when m.data_origin = 'DEMO' then m.demo_liquidity else null end as liquidity,
  r.yes_reserve,
  r.no_reserve,
  m.contract_address,
  m.confirmed_block,
  m.data_origin,
  m.created_at
from markets m
left join market_reserves r on r.market_id = m.id
where m.canonical = true;

create or replace view mvp_price_history with (security_invoker = true) as
select
  p.market_id,
  'CHAIN'::text as data_origin,
  p.yes_probability_bps,
  p.block_number,
  p.transaction_hash,
  p.created_at as observed_at
from probability_history p
where p.canonical = true
union all
select
  d.market_id,
  'DEMO'::text as data_origin,
  d.yes_probability_bps,
  null::bigint as block_number,
  null::text as transaction_hash,
  d.observed_at
from demo_probability_history d;

grant select on demo_probability_history,mvp_market_catalog,mvp_price_history to forecast_app;
grant select,insert on simulation_orders to forecast_app;
revoke update,delete on simulation_orders from forecast_app,forecast_indexer;

commit;
