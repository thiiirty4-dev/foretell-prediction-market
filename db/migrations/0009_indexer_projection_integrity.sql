BEGIN;

UPDATE indexed_blocks
SET orphaned_at = processed_at
WHERE canonical = false AND orphaned_at IS NULL;

ALTER TABLE indexed_blocks
  ADD CONSTRAINT indexed_blocks_hash_format CHECK (
    hash ~ '^0x[0-9a-f]{64}$' AND parent_hash ~ '^0x[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT indexed_blocks_canonical_orphan_consistency CHECK (
    (canonical = true AND orphaned_at IS NULL)
    OR (canonical = false AND orphaned_at IS NOT NULL)
  );

ALTER TABLE trades
  ADD CONSTRAINT trades_exact_amounts CHECK (
    collateral_amount > 0 AND share_amount > 0 AND fee_amount >= 0
  ),
  ADD CONSTRAINT trades_identity_format CHECK (
    transaction_hash ~ '^0x[0-9a-f]{64}$'
    AND block_hash IS NOT NULL
    AND block_hash ~ '^0x[0-9a-f]{64}$'
    AND wallet_address ~ '^0x[0-9a-f]{40}$'
  ),
  ADD CONSTRAINT trades_canonical_orphan_consistency CHECK (
    (canonical = true AND orphaned_at IS NULL)
    OR (canonical = false AND orphaned_at IS NOT NULL)
  );

ALTER TABLE market_reserves
  ADD CONSTRAINT market_reserves_nonnegative CHECK (
    yes_reserve >= 0 AND no_reserve >= 0
  ),
  ADD CONSTRAINT market_reserves_block_order CHECK (
    as_of_block >= 0 AND last_block_number >= 0
    AND as_of_block = last_block_number
  );

ALTER TABLE positions
  ADD CONSTRAINT positions_exact_nonnegative_values CHECK (
    yes_quantity >= 0 AND no_quantity >= 0 AND cost_basis >= 0
    AND as_of_block >= 0
  ),
  ADD CONSTRAINT positions_wallet_format CHECK (
    wallet_address ~ '^0x[0-9a-f]{40}$'
  );

ALTER TABLE asset_balances
  ADD CONSTRAINT asset_balances_exact_nonnegative_values CHECK (
    balance >= 0 AND as_of_block >= 0
  ),
  ADD CONSTRAINT asset_balances_wallet_format CHECK (
    wallet_address ~ '^0x[0-9a-f]{40}$'
  );

ALTER TABLE probability_history
  ADD CONSTRAINT probability_history_range CHECK (
    yes_probability_bps BETWEEN 0 AND 10000
  ),
  ADD CONSTRAINT probability_history_event_identity CHECK (
    chain_id = 80002
    AND log_index IS NOT NULL AND log_index >= 0
    AND transaction_hash ~ '^0x[0-9a-f]{64}$'
    AND block_hash IS NOT NULL AND block_hash ~ '^0x[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT probability_history_canonical_orphan_consistency CHECK (
    (canonical = true AND orphaned_at IS NULL)
    OR (canonical = false AND orphaned_at IS NOT NULL)
  );

ALTER TABLE market_outcomes
  ADD CONSTRAINT market_outcomes_exact_nonnegative_values CHECK (
    (position_id IS NULL OR position_id >= 0)
    AND (payout_numerator IS NULL OR payout_numerator >= 0)
  );

ALTER TABLE orders
  ADD CONSTRAINT orders_exact_positive_amounts CHECK (
    amount > 0 AND tx_value >= 0
  ),
  ADD CONSTRAINT orders_chain_field_format CHECK (
    wallet_address ~ '^0x[0-9a-f]{40}$'
    AND tx_to ~ '^0x[0-9a-f]{40}$'
    AND tx_data ~ '^0x(?:[0-9a-f]{2})*$'
    AND (transaction_hash IS NULL OR transaction_hash ~ '^0x[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT orders_idempotency_shape CHECK (
    length(idempotency_key) BETWEEN 1 AND 128
    AND request_hash ~ '^[0-9a-f]{64}$'
  );

CREATE UNIQUE INDEX orders_transaction_hash_unique
  ON orders (transaction_hash)
  WHERE transaction_hash IS NOT NULL;

ALTER TABLE order_state_history
  ADD CONSTRAINT order_state_history_legal_transition CHECK (
    from_state IS NULL OR (from_state, to_state) IN (
      ('PREPARED', 'AWAITING_SIGNATURE'), ('PREPARED', 'EXPIRED'),
      ('AWAITING_SIGNATURE', 'SUBMITTED'), ('AWAITING_SIGNATURE', 'REJECTED'),
      ('SUBMITTED', 'CONFIRMING'), ('SUBMITTED', 'REPLACED'), ('SUBMITTED', 'DROPPED'),
      ('CONFIRMING', 'CONFIRMED'), ('CONFIRMING', 'FAILED'), ('CONFIRMING', 'REPLACED'),
      ('CONFIRMED', 'INDEXED'), ('CONFIRMED', 'REORGED'),
      ('INDEXED', 'ORPHANED'),
      ('REORGED', 'CONFIRMING'), ('REORGED', 'FAILED'),
      ('ORPHANED', 'CONFIRMING'), ('ORPHANED', 'FAILED')
    )
  );

ALTER TABLE transaction_receipts
  ADD CONSTRAINT transaction_receipts_values CHECK (
    chain_id = 80002 AND confirmations >= 0
    AND (status IS NULL OR status IN (0, 1))
  ),
  ADD CONSTRAINT transaction_receipts_hash_format CHECK (
    transaction_hash ~ '^0x[0-9a-f]{64}$'
    AND (block_hash IS NULL OR block_hash ~ '^0x[0-9a-f]{64}$')
  );

CREATE TRIGGER receipts_no_update
BEFORE UPDATE ON transaction_receipts
FOR EACH ROW EXECUTE FUNCTION reject_mutation();

ALTER TABLE indexer_order_state_observations
  ADD CONSTRAINT indexer_order_state_known_values CHECK (
    from_status IN ('PREPARED','AWAITING_SIGNATURE','SUBMITTED','CONFIRMING','CONFIRMED','INDEXED','EXPIRED','REJECTED','REPLACED','DROPPED','FAILED','REORGED','ORPHANED')
    AND to_status IN ('PREPARED','AWAITING_SIGNATURE','SUBMITTED','CONFIRMING','CONFIRMED','INDEXED','EXPIRED','REJECTED','REPLACED','DROPPED','FAILED','REORGED','ORPHANED')
  ),
  ADD CONSTRAINT indexer_order_state_legal_transition CHECK (
    (from_status, to_status) IN (
      ('PREPARED', 'AWAITING_SIGNATURE'), ('PREPARED', 'EXPIRED'),
      ('AWAITING_SIGNATURE', 'SUBMITTED'), ('AWAITING_SIGNATURE', 'REJECTED'),
      ('SUBMITTED', 'CONFIRMING'), ('SUBMITTED', 'REPLACED'), ('SUBMITTED', 'DROPPED'),
      ('CONFIRMING', 'CONFIRMED'), ('CONFIRMING', 'FAILED'), ('CONFIRMING', 'REPLACED'),
      ('CONFIRMED', 'INDEXED'), ('CONFIRMED', 'REORGED'),
      ('INDEXED', 'ORPHANED'),
      ('REORGED', 'CONFIRMING'), ('REORGED', 'FAILED'),
      ('ORPHANED', 'CONFIRMING'), ('ORPHANED', 'FAILED')
    )
  ),
  ADD CONSTRAINT indexer_order_state_transaction_hash_format CHECK (
    transaction_hash ~ '^0x[0-9a-f]{64}$'
  );

ALTER TABLE indexer_transaction_observations
  ADD CONSTRAINT indexer_transaction_observation_identity CHECK (
    chain_id = 80002
    AND transaction_hash ~ '^0x[0-9a-f]{64}$'
    AND block_hash ~ '^0x[0-9a-f]{64}$'
  );

ALTER TABLE indexed_market_events
  ADD COLUMN projector_version INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT indexed_market_events_projector_version CHECK (projector_version > 0),
  ADD CONSTRAINT indexed_market_events_identity_format CHECK (
    chain_id = 80002
    AND transaction_hash ~ '^0x[0-9a-f]{64}$'
    AND log_index >= 0
    AND block_hash ~ '^0x[0-9a-f]{64}$'
    AND contract_address ~ '^0x[0-9a-f]{40}$'
    AND (actor_address IS NULL OR actor_address ~ '^0x[0-9a-f]{40}$')
  ),
  ADD CONSTRAINT indexed_market_events_exact_nonnegative_values CHECK (
    (collateral_amount IS NULL OR collateral_amount >= 0)
    AND (share_amount IS NULL OR share_amount >= 0)
    AND (fee_amount IS NULL OR fee_amount >= 0)
    AND (yes_reserve IS NULL OR yes_reserve >= 0)
    AND (no_reserve IS NULL OR no_reserve >= 0)
    AND (outcome IS NULL OR outcome BETWEEN 0 AND 2)
  ),
  ADD CONSTRAINT indexed_market_events_projection_shape CHECK (
    (projection_type = 'MARKET_CREATED' AND market_id IS NOT NULL AND actor_address IS NOT NULL AND status_after = 'OPEN')
    OR (projection_type = 'MARKET_STATUS_CHANGED' AND market_id IS NOT NULL AND status_after IS NOT NULL)
    OR (projection_type = 'PROBABILITY_CHANGED' AND market_id IS NOT NULL AND yes_reserve IS NOT NULL AND no_reserve IS NOT NULL)
    OR (projection_type = 'ORDER_FILLED' AND market_id IS NOT NULL AND actor_address IS NOT NULL AND side IS NOT NULL AND action IS NOT NULL AND collateral_amount IS NOT NULL AND share_amount IS NOT NULL AND fee_amount IS NOT NULL AND yes_reserve IS NOT NULL AND no_reserve IS NOT NULL)
    OR (projection_type = 'LIQUIDITY_CHANGED' AND market_id IS NOT NULL AND yes_reserve IS NOT NULL AND no_reserve IS NOT NULL)
    OR (projection_type = 'SETTLEMENT' AND market_id IS NOT NULL)
    OR (projection_type = 'REDEMPTION' AND market_id IS NOT NULL AND actor_address IS NOT NULL AND collateral_amount IS NOT NULL)
    OR (projection_type = 'POSITION_CHANGED' AND market_id IS NOT NULL AND actor_address IS NOT NULL AND share_amount IS NOT NULL)
    OR (projection_type = 'ASSET_ACTIVITY' AND actor_address IS NOT NULL AND collateral_amount IS NOT NULL)
    OR (projection_type = 'CONDITION_PREPARED' AND market_id IS NOT NULL AND actor_address IS NOT NULL)
  );

ALTER TABLE indexed_market_events
  DROP CONSTRAINT indexed_market_events_pkey;

ALTER TABLE indexed_market_events
  ADD CONSTRAINT indexed_market_events_pkey PRIMARY KEY (
    chain_id, transaction_hash, log_index, block_hash,
    projection_type, projector_version
  );

CREATE OR REPLACE VIEW current_indexed_market_events AS
SELECT
  projection.chain_id,
  projection.transaction_hash,
  projection.log_index,
  projection.block_hash,
  projection.projection_type,
  projection.market_id,
  projection.contract_address,
  projection.event_name,
  projection.event_signature,
  projection.actor_address,
  projection.side,
  projection.action,
  projection.collateral_amount,
  projection.share_amount,
  projection.fee_amount,
  projection.yes_reserve,
  projection.no_reserve,
  projection.outcome,
  projection.cancelled,
  projection.status_after,
  projection.details,
  projection.block_number,
  projection.block_timestamp,
  projection.indexed_at,
  source_event.canonical,
  source_event.canonicality_reason,
  source_event.canonicality_observed_at
FROM indexed_market_events AS projection
JOIN indexer_current_events AS source_event
  ON source_event.chain_id = projection.chain_id
 AND source_event.transaction_hash = projection.transaction_hash
 AND source_event.log_index = projection.log_index
 AND source_event.block_hash = projection.block_hash
WHERE projection.projector_version = (
  SELECT max(candidate.projector_version)
  FROM indexed_market_events AS candidate
  WHERE candidate.chain_id = projection.chain_id
    AND candidate.transaction_hash = projection.transaction_hash
    AND candidate.log_index = projection.log_index
    AND candidate.block_hash = projection.block_hash
    AND candidate.projection_type = projection.projection_type
);

COMMIT;
