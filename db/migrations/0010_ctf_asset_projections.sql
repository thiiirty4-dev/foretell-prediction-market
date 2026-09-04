BEGIN;

CREATE TABLE ctf_position_mappings (
  chain_id integer NOT NULL,
  ctf_address text NOT NULL,
  market_id uuid NOT NULL REFERENCES markets(id),
  market_address text NOT NULL,
  condition_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('YES', 'NO')),
  index_set numeric(78, 0) NOT NULL CHECK (index_set > 0),
  collection_id text NOT NULL,
  position_id numeric(78, 0) NOT NULL CHECK (position_id >= 0),
  token_id numeric(78, 0) GENERATED ALWAYS AS (position_id) STORED,
  source_transaction_hash text NOT NULL,
  source_log_index integer NOT NULL CHECK (source_log_index >= 0),
  source_block_number bigint NOT NULL CHECK (source_block_number >= 0),
  source_block_hash text NOT NULL,
  canonical boolean NOT NULL DEFAULT true,
  orphaned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, outcome),
  UNIQUE (chain_id, ctf_address, position_id),
  UNIQUE (market_id, outcome, position_id),
  CHECK (chain_id = 80002),
  CHECK (ctf_address ~ '^0x[0-9a-f]{40}$'),
  CHECK (market_address ~ '^0x[0-9a-f]{40}$'),
  CHECK (condition_id ~ '^0x[0-9a-f]{64}$'),
  CHECK (collection_id ~ '^0x[0-9a-f]{64}$'),
  CHECK (source_transaction_hash ~ '^0x[0-9a-f]{64}$'),
  CHECK (source_block_hash ~ '^0x[0-9a-f]{64}$'),
  CHECK (
    (canonical = true AND orphaned_at IS NULL)
    OR (canonical = false AND orphaned_at IS NOT NULL)
  )
);

ALTER TABLE market_outcomes
  ADD CONSTRAINT market_outcomes_position_mapping_fkey
  FOREIGN KEY (market_id, side, position_id)
  REFERENCES ctf_position_mappings (market_id, outcome, position_id)
  DEFERRABLE INITIALLY DEFERRED
  NOT VALID;

CREATE TABLE ctf_position_movements (
  chain_id integer NOT NULL,
  transaction_hash text NOT NULL,
  log_index integer NOT NULL CHECK (log_index >= 0),
  block_hash text NOT NULL,
  block_number bigint NOT NULL CHECK (block_number >= 0),
  ctf_address text NOT NULL,
  market_id uuid NOT NULL REFERENCES markets(id),
  outcome text NOT NULL CHECK (outcome IN ('YES', 'NO')),
  position_id numeric(78, 0) NOT NULL CHECK (position_id >= 0),
  item_index integer NOT NULL CHECK (item_index >= 0),
  account text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
  amount numeric(78, 0) NOT NULL CHECK (amount >= 0),
  event_name text NOT NULL CHECK (event_name IN ('TransferSingle', 'TransferBatch')),
  canonical boolean NOT NULL DEFAULT true,
  orphaned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (
    chain_id, transaction_hash, log_index, block_hash,
    item_index, account, direction
  ),
  CHECK (chain_id = 80002),
  CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  CHECK (ctf_address ~ '^0x[0-9a-f]{40}$'),
  CHECK (account ~ '^0x[0-9a-f]{40}$'),
  CHECK (account <> '0x0000000000000000000000000000000000000000'),
  CHECK (
    (canonical = true AND orphaned_at IS NULL)
    OR (canonical = false AND orphaned_at IS NOT NULL)
  )
);

CREATE INDEX ctf_position_movements_balance_replay_idx
  ON ctf_position_movements (
    chain_id, ctf_address, account, position_id, canonical, block_number
  );
CREATE INDEX ctf_position_movements_reorg_idx
  ON ctf_position_movements (chain_id, block_number)
  WHERE canonical = true;

CREATE TABLE ctf_position_balances (
  chain_id integer NOT NULL,
  ctf_address text NOT NULL,
  market_id uuid NOT NULL REFERENCES markets(id),
  outcome text NOT NULL CHECK (outcome IN ('YES', 'NO')),
  position_id numeric(78, 0) NOT NULL CHECK (position_id >= 0),
  account text NOT NULL,
  balance numeric(78, 0) NOT NULL CHECK (balance >= 0),
  as_of_block bigint NOT NULL CHECK (as_of_block >= 0),
  confirmed_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, ctf_address, account, position_id),
  CHECK (chain_id = 80002),
  CHECK (ctf_address ~ '^0x[0-9a-f]{40}$'),
  CHECK (account ~ '^0x[0-9a-f]{40}$'),
  CHECK (account <> '0x0000000000000000000000000000000000000000')
);

CREATE INDEX ctf_position_balances_market_account_idx
  ON ctf_position_balances (market_id, account);

CREATE TABLE asset_balance_movements (
  chain_id integer NOT NULL,
  transaction_hash text NOT NULL,
  log_index integer NOT NULL CHECK (log_index >= 0),
  block_hash text NOT NULL,
  block_number bigint NOT NULL CHECK (block_number >= 0),
  token_address text NOT NULL,
  account text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
  amount numeric(78, 0) NOT NULL CHECK (amount >= 0),
  canonical boolean NOT NULL DEFAULT true,
  orphaned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (
    chain_id, transaction_hash, log_index, block_hash, account, direction
  ),
  CHECK (chain_id = 80002),
  CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  CHECK (token_address ~ '^0x[0-9a-f]{40}$'),
  CHECK (account ~ '^0x[0-9a-f]{40}$'),
  CHECK (account <> '0x0000000000000000000000000000000000000000'),
  CHECK (
    (canonical = true AND orphaned_at IS NULL)
    OR (canonical = false AND orphaned_at IS NOT NULL)
  )
);

CREATE INDEX asset_balance_movements_replay_idx
  ON asset_balance_movements (
    chain_id, token_address, account, canonical, block_number
  );
CREATE INDEX asset_balance_movements_reorg_idx
  ON asset_balance_movements (chain_id, block_number)
  WHERE canonical = true;

ALTER TABLE asset_balances
  ADD COLUMN chain_id integer NOT NULL DEFAULT 80002,
  ADD COLUMN token_address text,
  ADD COLUMN decimals smallint NOT NULL DEFAULT 6;

ALTER TABLE asset_balances
  ADD CONSTRAINT asset_balances_chain_id_check CHECK (chain_id = 80002),
  ADD CONSTRAINT asset_balances_decimals_check CHECK (decimals = 6),
  ADD CONSTRAINT asset_balances_token_address_format CHECK (
    token_address IS NULL OR token_address ~ '^0x[0-9a-f]{40}$'
  );

CREATE UNIQUE INDEX asset_balances_canonical_asset_idx
  ON asset_balances (chain_id, token_address, wallet_address)
  WHERE token_address IS NOT NULL;

CREATE TABLE challenge_event_links (
  chain_id integer NOT NULL,
  transaction_hash text NOT NULL,
  log_index integer NOT NULL CHECK (log_index >= 0),
  block_hash text NOT NULL,
  block_number bigint NOT NULL CHECK (block_number >= 0),
  market_id uuid NOT NULL REFERENCES markets(id),
  challenge_id uuid REFERENCES challenges(id),
  challenger_address text NOT NULL,
  bond numeric(78, 0) NOT NULL CHECK (bond >= 0),
  reason_hash text NOT NULL,
  canonical boolean NOT NULL DEFAULT true,
  orphaned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, transaction_hash, log_index, block_hash),
  CHECK (chain_id = 80002),
  CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  CHECK (challenger_address ~ '^0x[0-9a-f]{40}$'),
  CHECK (reason_hash ~ '^0x[0-9a-f]{64}$'),
  CHECK (
    (canonical = true AND orphaned_at IS NULL)
    OR (canonical = false AND orphaned_at IS NOT NULL)
  )
);

CREATE TABLE resolution_evidence_event_links (
  chain_id integer NOT NULL,
  transaction_hash text NOT NULL,
  log_index integer NOT NULL CHECK (log_index >= 0),
  block_hash text NOT NULL,
  block_number bigint NOT NULL CHECK (block_number >= 0),
  market_id uuid NOT NULL REFERENCES markets(id),
  resolution_evidence_id uuid REFERENCES resolution_evidence(id),
  proposed_outcome text NOT NULL CHECK (proposed_outcome IN ('YES', 'NO')),
  evidence_hash text NOT NULL,
  canonical boolean NOT NULL DEFAULT true,
  orphaned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, transaction_hash, log_index, block_hash),
  CHECK (chain_id = 80002),
  CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
  CHECK (evidence_hash ~ '^0x[0-9a-f]{64}$'),
  CHECK (
    (canonical = true AND orphaned_at IS NULL)
    OR (canonical = false AND orphaned_at IS NOT NULL)
  )
);

CREATE INDEX challenge_event_links_market_idx
  ON challenge_event_links (market_id, canonical, block_number);
CREATE INDEX resolution_evidence_event_links_market_idx
  ON resolution_evidence_event_links (market_id, canonical, block_number);

ALTER TABLE ctf_position_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctf_position_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctf_position_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_balance_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_event_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolution_evidence_event_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY ctf_position_mappings_indexer_access ON ctf_position_mappings
  FOR ALL TO forecast_indexer USING (true) WITH CHECK (true);
CREATE POLICY ctf_position_movements_indexer_access ON ctf_position_movements
  FOR ALL TO forecast_indexer USING (true) WITH CHECK (true);
CREATE POLICY ctf_position_balances_indexer_access ON ctf_position_balances
  FOR ALL TO forecast_indexer USING (true) WITH CHECK (true);
CREATE POLICY asset_balance_movements_indexer_access ON asset_balance_movements
  FOR ALL TO forecast_indexer USING (true) WITH CHECK (true);
CREATE POLICY challenge_event_links_indexer_access ON challenge_event_links
  FOR ALL TO forecast_indexer USING (true) WITH CHECK (true);
CREATE POLICY resolution_evidence_event_links_indexer_access ON resolution_evidence_event_links
  FOR ALL TO forecast_indexer USING (true) WITH CHECK (true);

REVOKE ALL ON ctf_position_mappings FROM PUBLIC, forecast_app;
REVOKE ALL ON ctf_position_movements FROM PUBLIC, forecast_app;
REVOKE ALL ON ctf_position_balances FROM PUBLIC, forecast_app;
REVOKE ALL ON asset_balance_movements FROM PUBLIC, forecast_app;
REVOKE ALL ON challenge_event_links FROM PUBLIC, forecast_app;
REVOKE ALL ON resolution_evidence_event_links FROM PUBLIC, forecast_app;

GRANT SELECT, INSERT, UPDATE ON ctf_position_mappings TO forecast_indexer;
GRANT SELECT, INSERT, UPDATE ON ctf_position_movements TO forecast_indexer;
GRANT SELECT, INSERT, UPDATE ON ctf_position_balances TO forecast_indexer;
GRANT SELECT, INSERT, UPDATE ON asset_balance_movements TO forecast_indexer;
GRANT SELECT, INSERT, UPDATE ON challenge_event_links TO forecast_indexer;
GRANT SELECT, INSERT, UPDATE ON resolution_evidence_event_links TO forecast_indexer;

COMMIT;
