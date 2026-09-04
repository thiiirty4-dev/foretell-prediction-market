import { apiError, ok, requestId } from "@/lib/http";
import { marketHistoryQuery, marketIdentifier } from "@/lib/schemas";
import { getMarketHistory, marketSourceMeta } from "@/lib/services/market-service";
import { getIndexerSyncStatus } from "@/lib/services/indexer-status-service";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identifier = marketIdentifier.parse((await context.params).id);
    const url = new URL(request.url);
    const query = marketHistoryQuery.parse({ limit: url.searchParams.get("limit") || undefined });
    const [history, indexer] = await Promise.all([
      getMarketHistory(identifier, query.limit),
      getIndexerSyncStatus(),
    ]);
    return ok(history, {
      requestId: requestId(request),
      ...marketSourceMeta(history.dataOrigin, history.confirmedBlock, indexer),
    });
  } catch (error) {
    return apiError(request, error);
  }
}
