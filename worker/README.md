# Polygon Amoy indexer

The worker is a read-only Polygon Amoy (`chainId 80002`) event consumer. It
creates no wallet client, accepts no private-key setting, and never broadcasts a
transaction.

## Configuration

Set the PostgreSQL URL, Amoy RPC URL, factory, fUSD, and Conditional Tokens
addresses through the variables documented in `.env.example`. Existing market
addresses can be supplied with `INDEXER_MARKET_ADDRESSES`; newly published
markets are discovered from the configured factory's `MarketCreated` event.

The initial block must be at or before every event that needs to be projected.
The default confirmation depth is 12 blocks. A zero address is rejected.

## Operation

Start or resume the daemon:

```text
npm run indexer
```

Process one confirmed batch from a specified block when no checkpoint exists:

```text
npm run indexer -- --from-block 123456 --once
```

Explicitly rewind and replay a bounded range:

```text
npm run indexer -- --from-block 123456 --to-block 124000 --resync --once
```

A stored checkpoint always wins during normal resume. Moving an existing
checkpoint backwards or forwards requires `--resync`, preventing accidental
event gaps.

The worker uses a PostgreSQL advisory lock to prevent concurrent batches. Each
block range, its event projections, and its checkpoint commit in one database
transaction. RPC and database failures are retried with bounded exponential
backoff. An undecodable event from a registered project contract stops the
range without advancing the checkpoint.

Reorg recovery preserves immutable event inclusions and appends canonicality
observations. Derived trades and probability rows are marked non-canonical,
affected reserves are rebuilt, order transitions are recorded, and replay
continues from the common ancestor.
