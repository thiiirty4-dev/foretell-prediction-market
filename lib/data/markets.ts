import "server-only";

import type { QueryResultRow } from "pg";

import { query } from "@/lib/db";
import type {
  MarketDataOrigin,
  MarketLifecycleState,
  MarketOutcomeRecord,
  MarketRecord,
  OutcomeSide,
  PriceHistoryRecord,
} from "@/lib/data/types";

interface MarketRow extends QueryResultRow {
  id: string;
  slug: string | null;
  question: string;
  description: string;
  category: string;
  resolution_source: string;
  rules: string;
  close_time: Date;
  status: MarketLifecycleState;
  yes_probability_bps: number;
  no_probability_bps: number;
  volume: string;
  liquidity: string | null;
  yes_reserve: string | null;
  no_reserve: string | null;
  contract_address: string | null;
  confirmed_block: string | null;
  data_origin: MarketDataOrigin;
  created_at: Date;
}

interface OutcomeRow extends QueryResultRow {
  id: string;
  market_id: string;
  side: OutcomeSide;
  position_id: string | null;
  payout_numerator: string | null;
}

interface PriceRow extends QueryResultRow {
  market_id: string;
  data_origin: MarketDataOrigin;
  yes_probability_bps: number;
  block_number: string | null;
  transaction_hash: string | null;
  observed_at: Date;
}

export interface MarketListCursor {
  sort: "newest";
  createdAt: Date;
  id: string;
}

export type MarketSort = "trending" | "volume" | "newest" | "ending-soon";
export type StableMarketCursor =
  | MarketListCursor
  | { sort: "trending" | "volume"; volume: bigint; createdAt: Date; id: string }
  | { sort: "ending-soon"; closeTime: Date; id: string };

export interface MarketListInput {
  category?: string;
  search?: string;
  origins?: readonly MarketDataOrigin[];
  statuses?: readonly MarketLifecycleState[];
  sort?: MarketSort;
  cursor?: StableMarketCursor;
  limit?: number;
}

export interface MarketPage {
  items: MarketRecord[];
  nextCursor: StableMarketCursor | null;
}

function boundedLimit(limit = 20, maximum = 100): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw new RangeError(`limit must be an integer between 1 and ${maximum}`);
  }
  return limit;
}

function mapMarket(row: MarketRow): MarketRecord {
  return {
    id: row.id,
    slug: row.slug,
    question: row.question,
    description: row.description,
    category: row.category,
    resolutionSource: row.resolution_source,
    rules: row.rules,
    closeTime: row.close_time,
    status: row.status,
    yesProbabilityBps: row.yes_probability_bps,
    noProbabilityBps: row.no_probability_bps,
    volume: BigInt(row.volume),
    liquidity: row.liquidity === null ? null : BigInt(row.liquidity),
    yesReserve: row.yes_reserve === null ? null : BigInt(row.yes_reserve),
    noReserve: row.no_reserve === null ? null : BigInt(row.no_reserve),
    contractAddress: row.contract_address,
    confirmedBlock: row.confirmed_block === null ? null : BigInt(row.confirmed_block),
    dataOrigin: row.data_origin,
    createdAt: row.created_at,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function cursorFromRow(row: MarketRow, sort: MarketSort): StableMarketCursor {
  if (sort === "ending-soon") return { sort, closeTime: row.close_time, id: row.id };
  if (sort === "newest") return { sort, createdAt: row.created_at, id: row.id };
  return { sort, volume: BigInt(row.volume), createdAt: row.created_at, id: row.id };
}

export async function listMarkets(input: MarketListInput = {}): Promise<MarketPage> {
  const limit = boundedLimit(input.limit);
  const sort = input.sort ?? "trending";
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (input.search) {
    values.push(`%${escapeLike(input.search)}%`);
    conditions.push(`(question ilike $${values.length} escape '\\' or description ilike $${values.length} escape '\\' or category ilike $${values.length} escape '\\')`);
  }
  if (input.category) {
    values.push(input.category);
    conditions.push(`category = $${values.length}`);
  }
  if (input.origins?.length) {
    values.push([...input.origins]);
    conditions.push(`data_origin = any($${values.length}::text[])`);
  }
  if (input.statuses?.length) {
    values.push([...input.statuses]);
    conditions.push(`status = any($${values.length}::market_state[])`);
  }
  if (input.cursor) {
    if (input.cursor.sort !== sort) throw new RangeError("cursor sort does not match request sort");
    if (input.cursor.sort === "ending-soon") {
      values.push(input.cursor.closeTime.toISOString(), input.cursor.id);
      conditions.push(`(close_time,id) > ($${values.length - 1}::timestamptz,$${values.length}::uuid)`);
    } else if (input.cursor.sort === "newest") {
      values.push(input.cursor.createdAt.toISOString(), input.cursor.id);
      conditions.push(`(created_at,id) < ($${values.length - 1}::timestamptz,$${values.length}::uuid)`);
    } else {
      values.push(input.cursor.volume.toString(), input.cursor.createdAt.toISOString(), input.cursor.id);
      conditions.push(`(volume,created_at,id) < ($${values.length - 2}::numeric,$${values.length - 1}::timestamptz,$${values.length}::uuid)`);
    }
  }

  const orderBy = sort === "ending-soon"
    ? "close_time asc,id asc"
    : sort === "newest"
      ? "created_at desc,id desc"
      : "volume desc,created_at desc,id desc";
  values.push(limit + 1);
  const rows = await query<MarketRow>(
    `select id,slug,question,description,category,resolution_source,rules,close_time,status,
            yes_probability_bps,no_probability_bps,volume::text,liquidity::text,
            yes_reserve::text,no_reserve::text,contract_address,confirmed_block::text,
            data_origin,created_at
       from mvp_market_catalog
      ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
      order by ${orderBy}
      limit $${values.length}`,
    values,
  );
  const pageRows = rows.slice(0, limit);
  const last = rows.length > limit ? pageRows.at(-1) : undefined;

  return {
    items: pageRows.map(mapMarket),
    nextCursor: last ? cursorFromRow(last, sort) : null,
  };
}

export async function getMarket(identifier: string): Promise<MarketRecord | undefined> {
  const rows = await query<MarketRow>(
    `select id,slug,question,description,category,resolution_source,rules,close_time,status,
            yes_probability_bps,no_probability_bps,volume::text,liquidity::text,
            yes_reserve::text,no_reserve::text,contract_address,confirmed_block::text,
            data_origin,created_at
       from mvp_market_catalog
      where id::text = $1 or slug = $1
      limit 1`,
    [identifier],
  );
  return rows[0] ? mapMarket(rows[0]) : undefined;
}

export async function listMarketOutcomes(marketId: string): Promise<MarketOutcomeRecord[]> {
  const rows = await query<OutcomeRow>(
    `select id,market_id,side,position_id::text,payout_numerator::text
       from market_outcomes where market_id=$1 order by side`,
    [marketId],
  );
  return rows.map((row) => ({
    id: row.id,
    marketId: row.market_id,
    side: row.side,
    positionId: row.position_id === null ? null : BigInt(row.position_id),
    payoutNumerator: row.payout_numerator === null ? null : BigInt(row.payout_numerator),
  }));
}

export async function listPriceHistory(marketId: string, limit = 500): Promise<PriceHistoryRecord[]> {
  const bounded = boundedLimit(limit, 500);
  const rows = await query<PriceRow>(
    `select market_id,data_origin,yes_probability_bps,block_number::text,transaction_hash,observed_at
       from mvp_price_history
      where market_id=$1
      order by observed_at asc,block_number asc nulls first
      limit $2`,
    [marketId, bounded],
  );
  return rows.map((row) => ({
    marketId: row.market_id,
    dataOrigin: row.data_origin,
    yesProbabilityBps: row.yes_probability_bps,
    blockNumber: row.block_number === null ? null : BigInt(row.block_number),
    transactionHash: row.transaction_hash,
    observedAt: row.observed_at,
  }));
}
