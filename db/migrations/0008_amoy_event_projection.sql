BEGIN;

ALTER TABLE chain_event_inclusions
  ADD COLUMN IF NOT EXISTS event_signature TEXT,
  ADD COLUMN IF NOT EXISTS topic0 TEXT,
  ADD COLUMN IF NOT EXISTS indexed_args JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_data TEXT;

ALTER TABLE chain_event_inclusions
  ADD CONSTRAINT chain_event_inclusions_topic0_check
  CHECK (topic0 IS NULL OR topic0 ~ '^0x[0-9a-f]{64}$');

ALTER TABLE probability_history
  ADD COLUMN IF NOT EXISTS id BIGSERIAL;

ALTER TABLE probability_history
  DROP CONSTRAINT probability_history_pkey;

ALTER TABLE probability_history
  ADD CONSTRAINT probability_history_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX probability_history_event_identity_key
  ON probability_history (
    chain_id, transaction_hash, log_index, block_hash
  )
  WHERE log_index IS NOT NULL AND block_hash IS NOT NULL;

CREATE INDEX probability_history_market_canonical_idx
  ON probability_history (market_id, block_number, log_index)
  WHERE canonical = true;

CREATE TABLE indexed_market_events (
  chain_id INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  projection_type TEXT NOT NULL CHECK (
    projection_type IN (
      'MARKET_CREATED',
      'MARKET_STATUS_CHANGED',
      'PROBABILITY_CHANGED',
      'ORDER_FILLED',
      'LIQUIDITY_CHANGED',
      'SETTLEMENT',
      'REDEMPTION',
      'POSITION_CHANGED',
      'ASSET_ACTIVITY',
      'CONDITION_PREPARED'
    )
  ),
  market_id UUID REFERENCES markets(id),
  contract_address TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_signature TEXT NOT NULL,
  actor_address TEXT,
  side TEXT CHECK (side IS NULL OR side IN ('YES', 'NO')),
  action TEXT CHECK (action IS NULL OR action IN ('BUY', 'SELL')),
  collateral_amount NUMERIC(78, 0),
  share_amount NUMERIC(78, 0),
  fee_amount NUMERIC(78, 0),
  yes_reserve NUMERIC(78, 0),
  no_reserve NUMERIC(78, 0),
  outcome SMALLINT,
  cancelled BOOLEAN,
  status_after TEXT CHECK (
    status_after IS NULL
    OR status_after IN (
      'OPEN', 'CLOSED', 'PROPOSED', 'DISPUTED', 'RESOLVED', 'CANCELLED'
    )
  ),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  block_number BIGINT NOT NULL CHECK (block_number >= 0),
  block_timestamp TIMESTAMPTZ NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (
    chain_id,
    transaction_hash,
    log_index,
    block_hash,
    projection_type
  ),
  FOREIGN KEY (chain_id, transaction_hash, log_index, block_hash)
    REFERENCES chain_event_inclusions (
      chain_id, transaction_hash, log_index, block_hash
    )
);

CREATE INDEX indexed_market_events_market_block_idx
  ON indexed_market_events (market_id, block_number, log_index)
  WHERE market_id IS NOT NULL;

CREATE INDEX indexed_market_events_type_block_idx
  ON indexed_market_events (projection_type, block_number, log_index);

CREATE VIEW current_indexed_market_events AS
SELECT
  projection.*,
  source_event.canonical,
  source_event.canonicality_reason,
  source_event.canonicality_observed_at
FROM indexed_market_events AS projection
JOIN indexer_current_events AS source_event
  ON source_event.chain_id = projection.chain_id
 AND source_event.transaction_hash = projection.transaction_hash
 AND source_event.log_index = projection.log_index
 AND source_event.block_hash = projection.block_hash;

CREATE TRIGGER indexed_market_events_append_only
BEFORE UPDATE OR DELETE ON indexed_market_events
FOR EACH ROW EXECUTE FUNCTION prevent_indexer_history_mutation();

CREATE OR REPLACE VIEW mvp_market_catalog AS
SELECT
  market.id,
  market.slug,
  market.question,
  market.description,
  market.category,
  market.resolution_source,
  market.rules,
  market.close_time,
  market.status,
  market.yes_probability_bps,
  10000 - market.yes_probability_bps AS no_probability_bps,
  market.volume,
  CASE
    WHEN market.data_origin = 'DEMO' THEN market.demo_liquidity
    ELSE COALESCE(reserve.yes_reserve + reserve.no_reserve, 0)
  END AS liquidity,
  reserve.yes_reserve,
  reserve.no_reserve,
  market.contract_address,
  market.confirmed_block,
  market.data_origin,
  market.created_at
FROM markets AS market
LEFT JOIN market_reserves AS reserve ON reserve.market_id = market.id
WHERE market.canonical = true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forecast_indexer') THEN
    GRANT SELECT, INSERT ON indexed_market_events TO forecast_indexer;
    GRANT SELECT ON current_indexed_market_events TO forecast_indexer;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forecast_indexer;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forecast_app') THEN
    GRANT SELECT ON current_indexed_market_events TO forecast_app;
  END IF;
END;
$$;

COMMIT;
