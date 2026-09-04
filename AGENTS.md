# AGENTS.md

## Project Mission

Build a user-facing prediction market for the Polygon Amoy testnet. The product
should feel similar to Polymarket while remaining a test environment with no
real-money value.

The first release uses test collateral only. Test balances must not be sold,
withdrawn, bridged, redeemed for prizes, or represented as having monetary
value.

## Product Decisions

- Network: Polygon Amoy (`chainId` 80002).
- Market scope: binary YES/NO markets first; keep the domain model extensible.
- Trading: on-chain automated market maker for immediate liquidity.
- Settlement: on-chain proposal, dispute window, and finalization.
- Database: PostgreSQL is required for discovery, analytics, profiles, social
  features, moderation, and indexed blockchain events.
- Source of truth: contracts are authoritative for collateral, positions,
  trades, market state, and settlement. PostgreSQL is a rebuildable read model.
- Custody: the application must never store user private keys or sign trades on
  behalf of users.

## Architecture

Use a modular monolith with four explicit boundaries:

1. `app/` and `components/`: Next.js user and administration interfaces.
2. `app/api/` and `lib/`: HTTP queries, application services, validation, and
   shared TypeScript code.
3. `worker/`: blockchain event indexing, confirmations, reorg recovery, and
   asynchronous projections.
4. `contracts/`: Solidity contracts, deployment scripts, and contract tests.

Infrastructure and data definitions belong in:

- `db/`: PostgreSQL schema and forward-only migrations.
- `docker-compose.yml`: local infrastructure only.
- `.env.example`: documented non-secret configuration.

Do not introduce microservices until measured load or independent deployment
requirements justify them.

## Chain and Database Responsibilities

### On-chain

- Test collateral issuance and balances.
- Market creation and seeded liquidity.
- Quotes, buys, sells, and positions.
- Closing, resolution proposals, disputes, finalization, cancellation, and
  redemption.
- Events containing enough information to reconstruct the database read model.

### PostgreSQL

- Searchable market metadata and categories.
- Normalized blocks, transactions, trades, and probability history.
- Rebuildable position projections and leaderboards.
- User profiles linked to normalized wallet addresses.
- Comments, watchlists, notifications, reports, and moderation records.
- Indexer checkpoints and audit logs.

Never treat a database write as proof that an on-chain transaction succeeded.
Only confirmed receipts and decoded contract events may create indexed trades
or alter indexed on-chain state.

## Smart Contract Invariants

- Use integer arithmetic and explicit token decimals. Never use floating-point
  arithmetic for prices, balances, shares, or payouts.
- Collateral liabilities must remain fully backed at every state transition.
- Buying, selling, resolving, cancelling, and redeeming must be atomic and
  protected against reentrancy.
- Enforce slippage limits and transaction deadlines on user trades.
- A market cannot accept trades at or after its close time.
- Resolution rules, close time, evidence reference, and invalid/cancellation
  behavior must be immutable or governed by narrowly defined roles.
- A position can be redeemed at most once.
- Administrative privileges must be explicit, evented, and compatible with a
  future multisig owner.
- Each market stores a mechanism version. Never migrate active markets to new
  market math.
- Prefer audited OpenZeppelin primitives over custom token, access-control,
  signature, or transfer implementations.

Any change to pricing, payout, reserve, or resolution code requires unit tests,
fuzz tests, and invariant tests before it is considered complete.

## Indexer Rules

- Wait a configurable number of confirmations before publishing chain events.
- Identify events by `(chain_id, transaction_hash, log_index)` and make every
  projection idempotent.
- Store block number and block hash for all indexed events.
- Detect a changed block hash and rewind to the last valid checkpoint before
  replaying.
- Process a block range in one database transaction: raw events, projections,
  and checkpoint must commit together.
- Never silently skip an undecodable event from an address registered as a
  project contract. Stop the affected range and report it.
- Normalize EVM addresses to lowercase for database keys while preserving a
  checksummed form for display when useful.
- Database projections must be reproducible from genesis/deployment block.

## API and Backend Rules

- Validate all external input at the boundary with a schema library.
- Use parameterized SQL only.
- Keep public read endpoints separate from authenticated social or moderation
  writes.
- Paginate collection endpoints with stable cursors; do not ship unbounded
  queries.
- Return decimal blockchain values as strings across JSON boundaries.
- Use idempotency keys for retryable writes.
- Record security-sensitive administrative changes in an append-only audit log.
- Rate-limit authentication, comments, reports, faucets, and expensive search
  endpoints.

## Frontend Rules

- Show the connected network and reject transactions on networks other than
  Polygon Amoy.
- Label all balances and markets as testnet-only and having no monetary value.
- Before signing, show side, input, estimated shares, average price, price
  impact, minimum received, and contract address.
- Distinguish submitted, confirmed, indexed, failed, and replaced transaction
  states. A submitted wallet transaction is not yet a completed trade.
- Display account-critical balances, positions, orders, and leaderboard data
  only from confirmed backend projections. The backend may verify projections
  with server-side RPC calls; browser history is never an accounting source.
- Support keyboard navigation, visible focus states, reduced motion, mobile
  layouts, and meaningful loading/empty/error states.
- Preserve a clear visual identity; do not copy Polymarket branding or assets.

## Security and Privacy

- Never commit private keys, mnemonics, API secrets, database credentials, or
  production RPC URLs.
- Do not log wallet signatures, authentication tokens, cookies, or sensitive
  request bodies.
- Use wallet-signature authentication with one-time nonces, domain binding,
  expiration, and replay protection when authentication is introduced.
- Protect privileged accounts with strong authentication and short sessions.
- Apply CSRF protection to cookie-authenticated writes and a restrictive CSP to
  the web application.
- Sanitize user-generated content and keep rendered Markdown/HTML isolated.
- Treat RPC, Oracle, metadata, and user-provided URLs as untrusted input.
- Include pause and cancellation paths, but do not give administrators a path
  to seize user positions.

## Coding Conventions

### TypeScript

- Enable strict mode; do not use implicit `any`.
- Prefer small pure domain functions and discriminated unions for market and
  transaction states.
- Keep chain units as `bigint` internally and strings in JSON.
- Do not use JavaScript `number` for token amounts or share accounting.
- Keep React components focused on presentation and interaction; contract and
  database access belongs in services.

### Solidity

- Pin the compiler and dependency versions.
- Use custom errors for expected reverts.
- Follow checks-effects-interactions and use `SafeERC20`.
- Emit an event for every externally meaningful state transition.
- Add NatSpec to public and external functions.
- Keep loops bounded or move unbounded work off-chain.

### SQL

- Use snake_case identifiers, UTC timestamps, and explicit foreign keys.
- Store token quantities as `numeric(78, 0)` or another reviewed exact integer
  representation.
- Make migrations forward-only and safe to run once in order.
- Add indexes based on actual query paths, including event identity, market
  status, close time, trader, and block number.

## Development Workflow

Before implementation:

1. Identify the affected architecture boundary and data authority.
2. Write down new state transitions and failure cases.
3. For contract changes, state the collateral and payout invariants.
4. For schema changes, include the migration and replay impact.

During implementation:

1. Keep changes narrowly scoped.
2. Do not mix generated artifacts, deployment addresses, and source changes.
3. Preserve unrelated work in a dirty working tree.
4. Never deploy or broadcast a transaction without explicit user approval.

Before handoff, when validation is requested or authorized:

1. Run formatting and static checks for touched packages.
2. Run relevant unit and integration tests.
3. Run contract fuzz and invariant tests for financial logic.
4. Apply migrations to an empty database and replay fixture events.
5. Verify desktop and mobile interaction states.
6. Report what was not tested or deployed.

## Environment and Deployment

- Local development should run with documented commands and Docker Compose for
  PostgreSQL.
- Deployment addresses must be environment-specific and checked against chain
  ID at startup.
- Record contract addresses, deployment block, compiler settings, source commit,
  and constructor arguments in a versioned deployment manifest.
- Separate local, Amoy, and any future production configuration.
- Testnet deployment does not authorize mainnet deployment.

## Out of Scope Without a New Decision

- Real-money collateral or redeemable rewards.
- Mainnet deployment.
- Deposits, withdrawals, bridges, or fiat/crypto payment processing.
- KYC/AML implementation or claims of regulatory compliance.
- Copying code from repositories without a compatible, verified license.
- A centralized matching engine with authority to move user funds.
- Upgradeable contracts unless upgrade governance and storage risks are
  explicitly reviewed.

## Definition of Done

A feature is complete only when its user-visible states, chain transaction
states, database projection behavior, error handling, and operational recovery
path are accounted for. Financial correctness and replayability take priority
over convenience or visual polish.

## Established MVP Guardrails

- REST endpoints are versioned under `/api/v1/`, use `{data,error,meta}`, and
  are documented in `docs/openapi.yaml`.
- No API may directly adjust a user balance. Every asset change originates in
  a user-signed chain transaction and has an append-only transaction record.
- All monetary values use Solidity integers, TypeScript `bigint`, PostgreSQL
  `numeric(78,0)`, and decimal strings at JSON boundaries. Floating point is
  forbidden for accounting.
- All schema changes are forward migrations. Never delete or rewrite an
  applied migration, execute `DROP TABLE` in application code, or reset a
  production database.
- Asset projections are writable only by the indexer database role. Raw chain
  events, receipts, order state history, and audit logs are append-only.
- Fund-affecting operations must be atomic. Order transitions are enforced by
  the shared state machine and every retryable write requires idempotency.
- Privy and wallet ownership proofs are the only supported wallet-binding
  paths. Frontend code must never accept or store private keys, mnemonics, API
  secrets, or server credentials.
- Valflux and researched applications are behavioral references only. Do not
  copy their source, text, visual assets, or proprietary structure.
- Before every task: read this file, inspect relevant modules once, search for
  compatible existing functionality, explain the edit plan, then keep changes
  narrow. When validation is requested, run relevant tests and inspect the Git
  diff before reporting files, results, unverified items, and residual risks.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
