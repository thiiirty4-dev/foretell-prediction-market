BEGIN;

ALTER TABLE indexed_blocks
  ADD COLUMN IF NOT EXISTS block_timestamp TIMESTAMPTZ;

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS block_hash TEXT;

ALTER TABLE probability_history
  ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT 80002,
  ADD COLUMN IF NOT EXISTS log_index INTEGER,
  ADD COLUMN IF NOT EXISTS block_hash TEXT;

ALTER TABLE market_reserves
  ADD COLUMN IF NOT EXISTS last_block_number BIGINT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS indexed_blocks_one_canonical_height
  ON indexed_blocks (chain_id, number)
  WHERE canonical = true;

CREATE INDEX IF NOT EXISTS trades_chain_block_hash_idx
  ON trades (chain_id, block_number, block_hash)
  WHERE canonical = true;

CREATE INDEX IF NOT EXISTS probability_history_chain_block_idx
  ON probability_history (chain_id, block_number, block_hash)
  WHERE canonical = true;

CREATE TABLE IF NOT EXISTS indexer_contract_registry (
  chain_id INTEGER NOT NULL,
  address TEXT NOT NULL CHECK (address ~ '^0x[0-9a-f]{40}$'),
  kind TEXT NOT NULL CHECK (kind IN ('FACTORY', 'MARKET', 'FUSD', 'CTF')),
  abi_version INTEGER NOT NULL CHECK (abi_version > 0),
  deployment_block BIGINT NOT NULL CHECK (deployment_block >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL CHECK (source IN ('ENV', 'FACTORY_EVENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, address)
);

CREATE INDEX IF NOT EXISTS indexer_contract_registry_active_idx
  ON indexer_contract_registry (chain_id, deployment_block, address)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS indexer_runtime_checkpoints (
  chain_id INTEGER PRIMARY KEY,
  current_block BIGINT NOT NULL CHECK (current_block >= -1),
  current_hash TEXT,
  parent_hash TEXT,
  start_block BIGINT NOT NULL CHECK (start_block >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (current_block = -1 AND current_hash IS NULL AND parent_hash IS NULL)
    OR
    (current_block >= 0 AND current_hash IS NOT NULL AND parent_hash IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS chain_event_inclusions (
  chain_id INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL CHECK (
    transaction_hash ~ '^0x[0-9a-f]{64}$'
  ),
  log_index INTEGER NOT NULL CHECK (log_index >= 0),
  block_number BIGINT NOT NULL CHECK (block_number >= 0),
  block_hash TEXT NOT NULL CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  parent_hash TEXT NOT NULL CHECK (parent_hash ~ '^0x[0-9a-f]{64}$'),
  block_timestamp TIMESTAMPTZ NOT NULL,
  contract_address TEXT NOT NULL CHECK (
    contract_address ~ '^0x[0-9a-f]{40}$'
  ),
  event_name TEXT NOT NULL,
  event_args JSONB NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, transaction_hash, log_index, block_hash)
);

CREATE INDEX IF NOT EXISTS chain_event_inclusions_block_idx
  ON chain_event_inclusions (chain_id, block_number, log_index);

CREATE INDEX IF NOT EXISTS chain_event_inclusions_contract_idx
  ON chain_event_inclusions (chain_id, contract_address, block_number);

CREATE TABLE IF NOT EXISTS chain_event_canonicality (
  id BIGSERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  canonical BOOLEAN NOT NULL,
  reason TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (chain_id, transaction_hash, log_index, block_hash)
    REFERENCES chain_event_inclusions (
      chain_id, transaction_hash, log_index, block_hash
    )
);

CREATE INDEX IF NOT EXISTS chain_event_canonicality_lookup_idx
  ON chain_event_canonicality (
    chain_id, transaction_hash, log_index, block_hash, observed_at DESC, id DESC
  );

CREATE OR REPLACE VIEW indexer_current_events AS
SELECT
  inclusion.chain_id,
  inclusion.transaction_hash,
  inclusion.log_index,
  inclusion.block_number,
  inclusion.block_hash,
  inclusion.parent_hash,
  inclusion.block_timestamp,
  inclusion.contract_address,
  inclusion.event_name,
  inclusion.event_args,
  state.canonical,
  state.reason AS canonicality_reason,
  state.observed_at AS canonicality_observed_at
FROM chain_event_inclusions AS inclusion
JOIN LATERAL (
  SELECT canonical, reason, observed_at
  FROM chain_event_canonicality
  WHERE chain_id = inclusion.chain_id
    AND transaction_hash = inclusion.transaction_hash
    AND log_index = inclusion.log_index
    AND block_hash = inclusion.block_hash
  ORDER BY observed_at DESC, id DESC
  LIMIT 1
) AS state ON true;

CREATE TABLE IF NOT EXISTS indexer_reorgs (
  id BIGSERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  old_checkpoint_block BIGINT,
  old_checkpoint_hash TEXT,
  ancestor_block BIGINT,
  ancestor_hash TEXT,
  rewind_from_block BIGINT NOT NULL CHECK (rewind_from_block >= 0),
  reason TEXT NOT NULL CHECK (reason IN ('reorg', 'manual_resync')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indexer_order_state_observations (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL CHECK (block_number >= 0),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS indexer_order_state_order_idx
  ON indexer_order_state_observations (order_id, observed_at, id);

CREATE TABLE IF NOT EXISTS indexer_transaction_observations (
  id BIGSERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL CHECK (block_number >= 0),
  block_hash TEXT NOT NULL,
  successful BOOLEAN NOT NULL,
  canonical BOOLEAN NOT NULL,
  reason TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (
    chain_id, transaction_hash, block_hash, canonical, reason
  )
);

CREATE OR REPLACE FUNCTION prevent_indexer_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER chain_event_inclusions_append_only
BEFORE UPDATE OR DELETE ON chain_event_inclusions
FOR EACH ROW EXECUTE FUNCTION prevent_indexer_history_mutation();

CREATE TRIGGER chain_event_canonicality_append_only
BEFORE UPDATE OR DELETE ON chain_event_canonicality
FOR EACH ROW EXECUTE FUNCTION prevent_indexer_history_mutation();

CREATE TRIGGER indexer_reorgs_append_only
BEFORE UPDATE OR DELETE ON indexer_reorgs
FOR EACH ROW EXECUTE FUNCTION prevent_indexer_history_mutation();

CREATE TRIGGER indexer_order_state_observations_append_only
BEFORE UPDATE OR DELETE ON indexer_order_state_observations
FOR EACH ROW EXECUTE FUNCTION prevent_indexer_history_mutation();

CREATE TRIGGER indexer_transaction_observations_append_only
BEFORE UPDATE OR DELETE ON indexer_transaction_observations
FOR EACH ROW EXECUTE FUNCTION prevent_indexer_history_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forecast_indexer') THEN
    GRANT SELECT, INSERT, UPDATE ON
      indexer_contract_registry,
      indexer_runtime_checkpoints
    TO forecast_indexer;

    GRANT SELECT, INSERT ON
      chain_event_inclusions,
      chain_event_canonicality,
      indexer_reorgs,
      indexer_order_state_observations,
      indexer_transaction_observations
    TO forecast_indexer;

    GRANT SELECT ON indexer_current_events TO forecast_indexer;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forecast_indexer;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forecast_app') THEN
    GRANT SELECT ON
      indexer_contract_registry,
      indexer_runtime_checkpoints,
      indexer_current_events,
      indexer_reorgs,
      indexer_order_state_observations,
      indexer_transaction_observations
    TO forecast_app;
  END IF;
END;
$$;

COMMIT;
