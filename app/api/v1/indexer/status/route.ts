import { ok, requestId } from "@/lib/http";
import { getIndexerSyncStatus } from "@/lib/services/indexer-status-service";

export async function GET(request: Request) {
  const indexer = await getIndexerSyncStatus();
  return ok(indexer, {
    requestId: requestId(request),
    source: "postgres_indexer_checkpoint",
    asOfBlock: indexer.lastSyncedBlock ?? undefined,
    confirmedAt: indexer.lastSyncedAt ?? undefined,
    stale: indexer.stale,
    indexer,
  });
}
