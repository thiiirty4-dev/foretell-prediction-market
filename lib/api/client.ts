import type {
  ApiEnvelope,
  ApiIndexerStatus,
  ApiMarketDetail,
  ApiMarketHistoryData,
  ApiMarketListData,
  ApiMockOrder,
  ApiOrderListData,
  ApiPortfolio,
} from "@/lib/api/types";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = "REQUEST_FAILED") {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

interface ApiResult<T> {
  data: T;
  meta: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unavailableIndexerStatus(): ApiIndexerStatus {
  return {
    chainId: 80002,
    state: "UNAVAILABLE",
    lastSyncedBlock: null,
    lastSyncedAt: null,
    lastBlockTimestamp: null,
    stale: true,
  };
}

function indexerStatusFromMeta(meta: Record<string, unknown>): ApiIndexerStatus {
  const value = meta.indexer;
  if (!isRecord(value)) return unavailableIndexerStatus();
  const validState = ["HEALTHY", "STALE", "UNCONFIGURED", "UNAVAILABLE"].includes(String(value.state));
  const validBlock = value.lastSyncedBlock === null || typeof value.lastSyncedBlock === "string";
  const validSyncedAt = value.lastSyncedAt === null || typeof value.lastSyncedAt === "string";
  const validBlockTimestamp = value.lastBlockTimestamp === null || typeof value.lastBlockTimestamp === "string";
  if (value.chainId !== 80002 || !validState || !validBlock || !validSyncedAt || !validBlockTimestamp || typeof value.stale !== "boolean") {
    return unavailableIndexerStatus();
  }
  return value as unknown as ApiIndexerStatus;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError("The server returned an unreadable response.", response.status);
  }

  if (!isRecord(payload)) {
    throw new ApiClientError("The server returned an invalid response.", response.status);
  }

  const envelope = payload as unknown as ApiEnvelope<T>;
  if (!response.ok || envelope.error) {
    throw new ApiClientError(
      envelope.error?.message ?? "The request could not be completed.",
      response.status,
      envelope.error?.code,
    );
  }

  if (envelope.data === null || envelope.data === undefined) {
    throw new ApiClientError("The server returned no data.", response.status, "EMPTY_RESPONSE");
  }

  return {
    data: envelope.data,
    meta: isRecord(envelope.meta) ? envelope.meta : {},
  };
}

export interface MarketQuery {
  search?: string;
  category?: string;
  status?: string;
  sort?: "trending" | "volume" | "newest" | "ending-soon";
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

export async function fetchMarkets(query: MarketQuery = {}) {
  const parameters = new URLSearchParams();
  if (query.search) parameters.set("search", query.search);
  if (query.category) parameters.set("category", query.category);
  if (query.status) parameters.set("status", query.status);
  if (query.sort) parameters.set("sort", query.sort);
  if (query.cursor) parameters.set("cursor", query.cursor);
  if (query.limit) parameters.set("limit", String(query.limit));

  const suffix = parameters.size > 0 ? "?" + parameters.toString() : "";
  const result = await requestJson<ApiMarketListData>("/api/v1/markets" + suffix, {
    signal: query.signal,
  });
  return {
    ...result.data,
    nextCursor: typeof result.meta.nextCursor === "string" ? result.meta.nextCursor : null,
    indexer: indexerStatusFromMeta(result.meta),
  };
}

export async function fetchMarket(identifier: string, signal?: AbortSignal) {
  const result = await requestJson<ApiMarketDetail>(
    "/api/v1/markets/" + encodeURIComponent(identifier),
    { signal },
  );
  return { ...result.data, indexer: indexerStatusFromMeta(result.meta) };
}

export async function fetchMarketHistory(identifier: string, signal?: AbortSignal) {
  const result = await requestJson<ApiMarketHistoryData>(
    "/api/v1/markets/" + encodeURIComponent(identifier) + "/history",
    { signal },
  );
  return { ...result.data, indexer: indexerStatusFromMeta(result.meta) };
}

export async function fetchIndexerStatus(signal?: AbortSignal) {
  const result = await requestJson<ApiIndexerStatus>("/api/v1/indexer/status", { signal });
  return result.data;
}

export async function fetchOrders(signal?: AbortSignal) {
  const result = await requestJson<ApiOrderListData>("/api/v1/orders", { signal });
  return result.data;
}

export async function fetchPortfolio(signal?: AbortSignal) {
  const result = await requestJson<ApiPortfolio>("/api/v1/portfolio", { signal });
  return result.data;
}

export async function createMockOrder(
  input: { marketId: string; outcome: "YES" | "NO"; amount: string },
  idempotencyKey: string,
) {
  const result = await requestJson<ApiMockOrder>("/api/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  return result.data;
}
