export const AMOY_CHAIN_ID = 80002 as const;
export const INDEXER_STALE_AFTER_MS = 5 * 60 * 1000;

export type IndexerSyncState = "HEALTHY" | "STALE" | "UNCONFIGURED" | "UNAVAILABLE";

export interface IndexerSyncStatus {
  chainId: typeof AMOY_CHAIN_ID;
  state: IndexerSyncState;
  lastSyncedBlock: string | null;
  lastSyncedAt: string | null;
  lastBlockTimestamp: string | null;
  stale: boolean;
}

export interface IndexerCheckpointSnapshot {
  currentBlock: string;
  updatedAt: string;
  blockTimestamp: string | null;
}

export function unavailableIndexerStatus(state: "UNCONFIGURED" | "UNAVAILABLE"): IndexerSyncStatus {
  return {
    chainId: AMOY_CHAIN_ID,
    state,
    lastSyncedBlock: null,
    lastSyncedAt: null,
    lastBlockTimestamp: null,
    stale: true,
  };
}

export function deriveIndexerSyncStatus(
  checkpoint: IndexerCheckpointSnapshot | null,
  nowMs = Date.now(),
  staleAfterMs = INDEXER_STALE_AFTER_MS,
): IndexerSyncStatus {
  if (!checkpoint) return unavailableIndexerStatus("UNCONFIGURED");

  const updatedAtMs = Date.parse(checkpoint.updatedAt);
  const validBlock = /^(0|[1-9]\d*)$/.test(checkpoint.currentBlock);
  const timestampIsValid = checkpoint.blockTimestamp === null || Number.isFinite(Date.parse(checkpoint.blockTimestamp));
  if (!validBlock || !Number.isFinite(updatedAtMs) || !timestampIsValid || updatedAtMs > nowMs + 60_000) {
    return unavailableIndexerStatus("UNAVAILABLE");
  }

  const stale = nowMs - updatedAtMs > staleAfterMs;
  return {
    chainId: AMOY_CHAIN_ID,
    state: stale ? "STALE" : "HEALTHY",
    lastSyncedBlock: checkpoint.currentBlock,
    lastSyncedAt: checkpoint.updatedAt,
    lastBlockTimestamp: checkpoint.blockTimestamp,
    stale,
  };
}
