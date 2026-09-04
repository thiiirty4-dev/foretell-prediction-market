import { apiError, ok, requestId } from "@/lib/http";
import { marketIdentifier } from "@/lib/schemas";
import { getMarketDetail, marketSourceMeta } from "@/lib/services/market-service";
import { getIndexerSyncStatus } from "@/lib/services/indexer-status-service";

export async function GET(request: Request, context: RouteContext<"/api/v1/markets/[id]">) {
  try {
    const identifier = marketIdentifier.parse((await context.params).id);
    const [market, indexer] = await Promise.all([
      getMarketDetail(identifier),
      getIndexerSyncStatus(),
    ]);
    return ok(market, {
      requestId: requestId(request),
      ...marketSourceMeta(market.dataOrigin, market.confirmedBlock, indexer),
    });
  } catch (error) {
    return apiError(request, error);
  }
}
