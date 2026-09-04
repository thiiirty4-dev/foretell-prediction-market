import "server-only";

import { z } from "zod";

import { canonicalHash } from "@/lib/domain";
import { ApiException } from "@/lib/http";
import {
  getMarket,
  insertMarketDraft,
  listMarketOutcomes,
  listMarkets,
  listPriceHistory,
  type MarketSort,
  type StableMarketCursor,
} from "@/lib/data";
import type { MarketDataOrigin, MarketLifecycleState, MarketRecord, PriceHistoryRecord } from "@/lib/data";
import type { IndexerSyncStatus } from "@/lib/indexer-status";

const cursorPayload = z.object({
  version: z.literal(1),
  sort: z.enum(["trending", "volume", "newest", "ending-soon"]),
  filterHash: z.string().regex(/^[0-9a-f]{64}$/),
  id: z.string().uuid(),
  createdAt: z.string().datetime().optional(),
  closeTime: z.string().datetime().optional(),
  volume: z.string().regex(/^(0|[1-9]\d*)$/).optional(),
});

export interface MarketQueryInput {
  cursor?: string;
  search?: string;
  category?: string;
  status?: MarketLifecycleState;
  sort: MarketSort;
  limit: number;
}

export interface CreateDraftInput {
  question: string;
  description: string;
  category: string;
  resolutionSource: string;
  closeTime: string;
  rules: string;
}

function marketDto(market: MarketRecord) {
  return {
    id: market.id,
    slug: market.slug,
    question: market.question,
    description: market.description,
    category: market.category,
    status: market.status,
    yesProbabilityBps: market.yesProbabilityBps,
    noProbabilityBps: market.noProbabilityBps,
    volume: market.volume.toString(),
    liquidity: market.liquidity?.toString() ?? null,
    yesReserve: market.yesReserve?.toString() ?? null,
    noReserve: market.noReserve?.toString() ?? null,
    endTime: market.closeTime.toISOString(),
    contractAddress: market.contractAddress,
    confirmedBlock: market.confirmedBlock?.toString() ?? null,
    dataOrigin: market.dataOrigin,
    createdAt: market.createdAt.toISOString(),
  };
}

function priceDto(point: PriceHistoryRecord) {
  return {
    time: point.observedAt.toISOString(),
    yesPriceBps: point.yesProbabilityBps,
    noPriceBps: 10000 - point.yesProbabilityBps,
    dataOrigin: point.dataOrigin,
    blockNumber: point.blockNumber?.toString() ?? null,
    transactionHash: point.transactionHash,
  };
}

function filterHash(input: MarketQueryInput): string {
  return canonicalHash({
    search: input.search ?? null,
    category: input.category ?? null,
    status: input.status ?? null,
    sort: input.sort,
  });
}

function decodeCursor(value: string, input: MarketQueryInput): StableMarketCursor {
  try {
    const payload = cursorPayload.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (payload.sort !== input.sort || payload.filterHash !== filterHash(input)) throw new Error("cursor context mismatch");
    if (payload.sort === "ending-soon" && payload.closeTime) {
      return { sort: payload.sort, closeTime: new Date(payload.closeTime), id: payload.id };
    }
    if (payload.sort === "newest" && payload.createdAt) {
      return { sort: payload.sort, createdAt: new Date(payload.createdAt), id: payload.id };
    }
    if ((payload.sort === "trending" || payload.sort === "volume") && payload.createdAt && payload.volume) {
      return { sort: payload.sort, volume: BigInt(payload.volume), createdAt: new Date(payload.createdAt), id: payload.id };
    }
    throw new Error("cursor position missing");
  } catch {
    throw new ApiException(400, "INVALID_CURSOR", "分页 cursor 无效或与当前筛选条件不匹配");
  }
}

function encodeCursor(cursor: StableMarketCursor, input: MarketQueryInput): string {
  const common = { version: 1, sort: cursor.sort, filterHash: filterHash(input), id: cursor.id } as const;
  const payload = cursor.sort === "ending-soon"
    ? { ...common, closeTime: cursor.closeTime.toISOString() }
    : cursor.sort === "newest"
      ? { ...common, createdAt: cursor.createdAt.toISOString() }
      : { ...common, createdAt: cursor.createdAt.toISOString(), volume: cursor.volume.toString() };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export async function getMarkets(input: MarketQueryInput) {
  const page = await listMarkets({
    search: input.search,
    category: input.category,
    statuses: input.status ? [input.status] : undefined,
    sort: input.sort,
    cursor: input.cursor ? decodeCursor(input.cursor, input) : undefined,
    limit: input.limit,
  });
  return {
    items: page.items.map(marketDto),
    nextCursor: page.nextCursor ? encodeCursor(page.nextCursor, input) : null,
  };
}

export async function getMarketDetail(identifier: string) {
  const market = await getMarket(identifier);
  if (!market) throw new ApiException(404, "MARKET_NOT_FOUND", "市场不存在");
  const [outcomes, history] = await Promise.all([
    listMarketOutcomes(market.id),
    listPriceHistory(market.id),
  ]);
  return {
    ...marketDto(market),
    resolutionSource: market.resolutionSource,
    resolutionRules: market.rules,
    outcomes: outcomes.map((outcome) => ({
      id: outcome.id,
      side: outcome.side,
      positionId: outcome.positionId?.toString() ?? null,
      payoutNumerator: outcome.payoutNumerator?.toString() ?? null,
    })),
    priceHistory: history.map(priceDto),
  };
}

export async function getMarketHistory(identifier: string, limit: number) {
  const market = await getMarket(identifier);
  if (!market) throw new ApiException(404, "MARKET_NOT_FOUND", "市场不存在");
  const history = await listPriceHistory(market.id, limit);
  return {
    marketId: market.id,
    slug: market.slug,
    dataOrigin: market.dataOrigin,
    confirmedBlock: market.confirmedBlock?.toString() ?? null,
    items: history.map(priceDto),
  };
}

export async function createMarketDraft(ownerId: string, input: CreateDraftInput) {
  const closeTime = new Date(input.closeTime);
  const now = Date.now();
  if (closeTime.getTime() < now + 86_400_000 || closeTime.getTime() > now + 365 * 86_400_000) {
    throw new ApiException(400, "INVALID_CLOSE_TIME", "关闭时间须距今 24 小时至 365 天");
  }
  const draft = await insertMarketDraft({ ...input, ownerId, closeTime });
  return {
    ...draft,
    closeTime: draft.closeTime.toISOString(),
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export function marketSourceMeta(
  dataOrigin: MarketDataOrigin,
  confirmedBlock: string | null,
  indexer: IndexerSyncStatus,
) {
  return dataOrigin === "CHAIN"
    ? {
        source: "postgres_confirmed_projection",
        asOfBlock: confirmedBlock ?? indexer.lastSyncedBlock ?? undefined,
        confirmedAt: indexer.lastSyncedAt ?? undefined,
        stale: indexer.stale,
        indexer,
      }
    : { source: "postgres_demo_seed", stale: false, indexer };
}
