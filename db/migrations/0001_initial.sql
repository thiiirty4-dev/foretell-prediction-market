begin;
create extension if not exists pgcrypto;
create type app_role as enum ('USER','OPERATOR','RESOLVER','RESOLUTION_ADMIN');
create type draft_state as enum ('DRAFT','IN_REVIEW','APPROVED','REJECTED','PUBLISHED');
create type market_state as enum ('OPEN','CLOSED','PROPOSED','DISPUTED','RESOLVED','CANCELLED');
create type order_state as enum ('PREPARED','AWAITING_SIGNATURE','SUBMITTED','CONFIRMING','CONFIRMED','INDEXED','EXPIRED','REJECTED','REPLACED','DROPPED','FAILED','REORGED','ORPHANED');
create table app_users(id uuid primary key default gen_random_uuid(),privy_did text not null unique,display_name text,role app_role not null default 'USER',created_at timestamptz not null default now(),last_seen_at timestamptz not null default now());
create table user_wallets(id uuid primary key default gen_random_uuid(),user_id uuid not null references app_users,address text not null unique check(address=lower(address) and address ~ '^0x[0-9a-f]{40}$'),privy_verified boolean not null default false,proof_nonce text unique,proof_expires_at timestamptz,verified_at timestamptz,created_at timestamptz not null default now(),check(verified_at is null or privy_verified or proof_nonce is not null));
create table market_drafts(id uuid primary key default gen_random_uuid(),owner_id uuid not null references app_users,question text not null,description text not null,category text not null,resolution_source text not null,close_time timestamptz not null,rules text not null,state draft_state not null default 'DRAFT',revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table market_reviews(id uuid primary key default gen_random_uuid(),draft_id uuid not null references market_drafts,draft_revision integer not null,operator_id uuid not null references app_users,decision draft_state not null check(decision in('APPROVED','REJECTED')),reason text,created_at timestamptz not null default now(),unique(draft_id,draft_revision));
create table publication_authorizations(id uuid primary key default gen_random_uuid(),draft_id uuid not null references market_drafts,draft_revision integer not null,creator_address text not null,metadata_uri text not null,metadata_hash text not null,nonce text not null unique,expires_at timestamptz not null,signature text not null,consumed_tx_hash text,invalidated_at timestamptz,created_at timestamptz not null default now());
create table markets(id uuid primary key default gen_random_uuid(),draft_id uuid unique references market_drafts,chain_id integer not null default 80002 check(chain_id=80002),contract_address text unique,condition_id text,question text not null,description text not null,category text not null,resolution_source text not null,rules text not null,metadata_uri text not null,metadata_hash text not null,close_time timestamptz not null,status market_state not null default 'OPEN',mechanism_version integer not null default 1,fee_bps integer not null default 100 check(fee_bps=100),yes_probability_bps integer not null default 5000,volume numeric(78,0) not null default 0,confirmed_block bigint,canonical boolean not null default true,created_at timestamptz not null default now());
create index markets_discovery on markets(status,category,close_time,id desc) where canonical;
create table market_outcomes(id uuid primary key default gen_random_uuid(),market_id uuid not null references markets,side text not null check(side in('YES','NO')),position_id numeric(78,0),payout_numerator numeric(78,0),unique(market_id,side));
create table indexed_blocks(chain_id integer not null,number bigint not null,hash text not null,parent_hash text not null,canonical boolean not null default true,orphaned_at timestamptz,processed_at timestamptz not null default now(),primary key(chain_id,number,hash));
create table raw_events(chain_id integer not null,transaction_hash text not null,log_index integer not null,block_number bigint not null,block_hash text not null,contract_address text not null,event_name text not null,event_data jsonb not null,canonical boolean not null default true,orphaned_at timestamptz,indexed_at timestamptz not null default now(),primary key(chain_id,transaction_hash,log_index));
create index raw_events_block on raw_events(chain_id,block_number) where canonical;
create table project_contracts(address text primary key,kind text not null,abi_version integer not null,deployment_block bigint not null,active boolean not null default true);
create table trades(id uuid primary key default gen_random_uuid(),chain_id integer not null,transaction_hash text not null,log_index integer not null,market_id uuid not null references markets,wallet_address text not null,action text not null check(action in('BUY','SELL')),side text not null check(side in('YES','NO')),collateral_amount numeric(78,0) not null,share_amount numeric(78,0) not null,fee_amount numeric(78,0) not null,block_number bigint not null,canonical boolean not null default true,orphaned_at timestamptz,created_at timestamptz not null default now(),unique(chain_id,transaction_hash,log_index));
create index trades_market_time on trades(market_id,block_number desc) where canonical;
create index trades_wallet on trades(wallet_address,block_number desc) where canonical;
create table market_reserves(market_id uuid primary key references markets,yes_reserve numeric(78,0) not null,no_reserve numeric(78,0) not null,as_of_block bigint not null,updated_at timestamptz not null default now());
create table positions(market_id uuid not null references markets,wallet_address text not null,yes_quantity numeric(78,0) not null default 0,no_quantity numeric(78,0) not null default 0,cost_basis numeric(78,0) not null default 0,realized_pnl numeric(78,0) not null default 0,as_of_block bigint not null,updated_at timestamptz not null default now(),primary key(market_id,wallet_address));
create table asset_balances(wallet_address text primary key,balance numeric(78,0) not null,as_of_block bigint not null,confirmed_at timestamptz not null,updated_at timestamptz not null default now());
create table probability_history(market_id uuid not null references markets,block_number bigint not null,transaction_hash text not null,yes_probability_bps integer not null,canonical boolean not null default true,orphaned_at timestamptz,created_at timestamptz not null default now(),primary key(market_id,block_number,transaction_hash));
create table orders(id uuid primary key,user_id uuid not null references app_users,wallet_address text not null,market_id uuid not null references markets,operation text not null check(operation in('BUY','SELL')),side text not null check(side in('YES','NO')),amount numeric(78,0) not null,idempotency_key text not null,request_hash text not null,state order_state not null,tx_to text not null,tx_data text not null,tx_value numeric(78,0) not null default 0,transaction_hash text,expires_at timestamptz not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,idempotency_key));
create index orders_user_time on orders(user_id,created_at desc);
create table order_state_history(id bigint generated always as identity primary key,order_id uuid not null references orders,from_state order_state,to_state order_state not null,reason text not null,block_number bigint,created_at timestamptz not null default now());
create table transaction_receipts(chain_id integer not null,transaction_hash text not null,block_number bigint,block_hash text,status integer,confirmations integer not null default 0,canonical boolean not null default true,observed_at timestamptz not null default now(),primary key(chain_id,transaction_hash,observed_at));
create table faucet_claims(id uuid primary key default gen_random_uuid(),user_id uuid not null references app_users,wallet_address text not null,claim_id text not null unique,amount numeric(78,0) not null check(amount=10000000000),nonce numeric(78,0) not null,expires_at timestamptz not null,signature text not null,transaction_hash text,claimed_block bigint,created_at timestamptz not null default now(),unique(user_id),unique(wallet_address));
create table resolution_evidence(id uuid primary key default gen_random_uuid(),market_id uuid not null references markets,resolver_id uuid not null references app_users,proposed_outcome text not null check(proposed_outcome in('YES','NO','CANCELLED')),evidence_uri text not null,evidence_hash text not null,transaction_hash text,created_at timestamptz not null default now());
create table challenges(id uuid primary key default gen_random_uuid(),market_id uuid not null unique references markets,challenger_id uuid not null references app_users,wallet_address text not null,bond numeric(78,0) not null check(bond=100000000),reason text not null,authorization_nonce text not null unique,transaction_hash text,resolution text,created_at timestamptz not null default now());
create table leaderboard_snapshots(id bigint generated always as identity primary key,user_id uuid not null references app_users,net_profit numeric(78,0) not null,settled_markets integer not null,as_of_block bigint not null,created_at timestamptz not null default now());
create view leaderboard_current as select distinct on(s.user_id) s.user_id,u.display_name,s.net_profit,s.settled_markets,s.as_of_block from leaderboard_snapshots s join app_users u on u.id=s.user_id order by s.user_id,s.as_of_block desc,s.id desc;
create table indexer_checkpoints(chain_id integer primary key,block_number bigint not null,block_hash text not null,updated_at timestamptz not null default now());
create table audit_log(id bigint generated always as identity primary key,actor_user_id uuid references app_users,action text not null,target_type text not null,target_id text not null,payload jsonb not null default '{}',chain_id integer,transaction_hash text,block_number bigint,created_at timestamptz not null default now());
create or replace function reject_mutation() returns trigger language plpgsql as $$begin raise exception 'append-only table';end$$;
create or replace function protect_raw_event_mutation() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.chain_id = new.chain_id
      and old.transaction_hash = new.transaction_hash
      and old.log_index = new.log_index
      and old.contract_address = new.contract_address
      and old.event_name = new.event_name
      and old.event_data = new.event_data
      and old.indexed_at = new.indexed_at
      and (
        (old.canonical and not new.canonical
          and old.block_number = new.block_number
          and old.block_hash = new.block_hash
          and old.orphaned_at is null
          and new.orphaned_at is not null)
        or
        (not old.canonical and new.canonical
          and old.orphaned_at is not null
          and new.orphaned_at is null)
      )
    then
      return new;
    end if;
  end if;
  raise exception 'append-only table';
end$$;
create trigger raw_events_append_only before update or delete on raw_events for each row execute function protect_raw_event_mutation();
create trigger receipts_no_delete before delete on transaction_receipts for each row execute function reject_mutation();
create trigger history_append_only before update or delete on order_state_history for each row execute function reject_mutation();
create trigger audit_append_only before update or delete on audit_log for each row execute function reject_mutation();
commit;
