begin;

create table simulation_positions (
  user_id uuid not null references app_users(id),
  wallet_address text not null,
  market_id uuid not null references markets(id),
  yes_quantity numeric(78, 0) not null default 0 check (yes_quantity >= 0),
  no_quantity numeric(78, 0) not null default 0 check (no_quantity >= 0),
  cost_basis numeric(78, 0) not null default 0 check (cost_basis >= 0),
  last_order_id uuid not null references simulation_orders(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, wallet_address, market_id),
  foreign key (user_id, wallet_address)
    references user_wallets(user_id, address)
);

comment on table simulation_positions is
  'Rebuildable demo-only projection derived from append-only simulation_orders. Never an on-chain balance or position source.';

create index simulation_positions_user_updated_idx
  on simulation_positions (user_id, updated_at desc, market_id);

insert into simulation_positions (
  user_id,
  wallet_address,
  market_id,
  yes_quantity,
  no_quantity,
  cost_basis,
  last_order_id,
  updated_at
)
select
  user_id,
  wallet_address,
  market_id,
  sum(case when side = 'YES' then estimated_shares else 0 end),
  sum(case when side = 'NO' then estimated_shares else 0 end),
  sum(amount),
  (array_agg(id order by created_at desc, id desc))[1],
  max(created_at)
from simulation_orders
where operation = 'BUY'
group by user_id, wallet_address, market_id;

create function project_simulation_order_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.operation <> 'BUY' then
    return new;
  end if;

  insert into simulation_positions (
    user_id,
    wallet_address,
    market_id,
    yes_quantity,
    no_quantity,
    cost_basis,
    last_order_id,
    updated_at
  ) values (
    new.user_id,
    new.wallet_address,
    new.market_id,
    case when new.side = 'YES' then new.estimated_shares else 0 end,
    case when new.side = 'NO' then new.estimated_shares else 0 end,
    new.amount,
    new.id,
    new.created_at
  )
  on conflict (user_id, wallet_address, market_id) do update
  set
    yes_quantity = simulation_positions.yes_quantity + excluded.yes_quantity,
    no_quantity = simulation_positions.no_quantity + excluded.no_quantity,
    cost_basis = simulation_positions.cost_basis + excluded.cost_basis,
    last_order_id = excluded.last_order_id,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke all on function project_simulation_order_position() from public;

create trigger simulation_orders_project_position
after insert on simulation_orders
for each row execute function project_simulation_order_position();

alter table simulation_positions enable row level security;

create policy simulation_positions_self_select
  on simulation_positions
  for select
  to forecast_app
  using (
    user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

revoke all on simulation_positions from forecast_app;
grant select on simulation_positions to forecast_app;

commit;
