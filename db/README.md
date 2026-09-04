# PostgreSQL development data

The project uses the existing `pg` connection layer. Prisma, Drizzle, and other
ORMs are intentionally not added.

## Initialize a local database

1. Start PostgreSQL with `docker compose up -d postgres`.
2. Configure `.env.local` from `.env.example`.
3. Run `npm run db:init`.

`db:init` applies forward migrations first and then executes the idempotent demo
seed. Run `npm run db:migrate` or `npm run db:seed` separately when needed.

The seed is allowed automatically only for localhost databases. A remote
non-production development database also requires `ALLOW_DEMO_SEED=true`.
Production seeding is always rejected.

## Data authority

- `orders`, `trades`, `positions`, `asset_balances`, and
  `probability_history` remain chain-derived records.
- `simulation_orders` is append-only and non-accounting. It never changes a
  balance or a position.
- Demo markets use `markets.data_origin = 'DEMO'`, have no contract address or
  confirmed block, and keep demo-only liquidity separate from chain reserves.
- `mvp_market_catalog` and `mvp_price_history` expose typed read models without
  manufacturing chain confirmations for demo data.
