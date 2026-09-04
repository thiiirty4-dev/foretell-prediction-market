import { apiError, ok, requestId } from "@/lib/http";
import { marketDraft, marketListQuery } from "@/lib/schemas";
import { authenticate } from "@/lib/auth";
import { createMarketDraft, getMarkets } from "@/lib/services/market-service";
import { getIndexerSyncStatus } from "@/lib/services/indexer-status-service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = marketListQuery.parse({
      cursor: url.searchParams.get("cursor") || undefined,
      search: url.searchParams.get("search") || undefined,
      category: url.searchParams.get("category") || undefined,
      status: url.searchParams.get("status") || undefined,
      sort: url.searchParams.get("sort") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });
    const [result, indexer] = await Promise.all([getMarkets(query), getIndexerSyncStatus()]);
    return ok({ items: result.items }, {
      requestId: requestId(request),
      nextCursor: result.nextCursor,
      source: "postgres_indexer_preferred_read_model",
      asOfBlock: indexer.lastSyncedBlock ?? undefined,
      confirmedAt: indexer.lastSyncedAt ?? undefined,
      stale: indexer.stale,
      indexer,
    });
  } catch (error) {
    return apiError(request, error);
  }
}

export async function POST(request: Request) {
  try {
    const principal = await authenticate(request);
    const body = marketDraft.parse(await request.json());
    const draft = await createMarketDraft(principal.id, body);
    return ok(draft, { requestId: requestId(request) }, 201);
  } catch (error) {
    return apiError(request, error);
  }
}
