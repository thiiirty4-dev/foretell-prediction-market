# Foretell Lab

Clean-room Polygon Amoy binary prediction-market MVP. It uses user-signed transactions, `fUSD` with no real-world value, Gnosis Conditional Tokens, an independently implemented FPMM, PostgreSQL confirmed projections, and Privy authentication.

## Local setup

1. Copy `.env.example` to a local `.env.local` and provide test-only secrets.
2. Run `docker compose up -d`.
3. Run `npm install` and `npm run db:migrate`.
4. Install the pinned Foundry dependencies listed in `contracts/README.md`.
5. Run `npm run dev` and `npm run indexer` in separate terminals.

No deployment command broadcasts by default. Polygon Amoy deployment requires a separately reviewed manifest and explicit approval.

## Authority boundaries

- Contracts: collateral, outcome tokens, trades, settlement, challenge bonds.
- Indexer: the only writer of confirmed asset/trade/position projections.
- API: authentication, review workflow, vouchers, idempotency, unsigned transaction plans.
- Browser: presentation and user-wallet signing only.

See `docs/openapi.yaml`, `AGENTS.md`, and `THIRD_PARTY_NOTICES.md` before changing protocol behavior.
