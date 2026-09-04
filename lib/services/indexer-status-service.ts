import "server-only";

import { getIndexerCheckpoint } from "@/lib/data";
import {
  AMOY_CHAIN_ID,
  deriveIndexerSyncStatus,
  unavailableIndexerStatus,
  type IndexerSyncStatus,
} from "@/lib/indexer-status";

export async function getIndexerSyncStatus(): Promise<IndexerSyncStatus> {
  try {
    const checkpoint = await getIndexerCheckpoint(AMOY_CHAIN_ID);
    return deriveIndexerSyncStatus(checkpoint);
  } catch (error) {
    console.error("indexer_status_query_failed", {
      chainId: AMOY_CHAIN_ID,
      error: error instanceof Error ? error.message : "unknown",
    });
    return unavailableIndexerStatus("UNAVAILABLE");
  }
}
