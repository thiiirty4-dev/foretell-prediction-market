import "server-only";

import type { QueryResultRow } from "pg";

import { query } from "@/lib/db";
import type { MarketDraftRecord } from "@/lib/data/types";

interface MarketDraftRow extends QueryResultRow {
  id: string;
  owner_id: string;
  question: string;
  description: string;
  category: string;
  resolution_source: string;
  close_time: Date;
  rules: string;
  state: MarketDraftRecord["state"];
  revision: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateMarketDraftInput {
  ownerId: string;
  question: string;
  description: string;
  category: string;
  resolutionSource: string;
  closeTime: Date;
  rules: string;
}

function mapDraft(row: MarketDraftRow): MarketDraftRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    question: row.question,
    description: row.description,
    category: row.category,
    resolutionSource: row.resolution_source,
    closeTime: row.close_time,
    rules: row.rules,
    state: row.state,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertMarketDraft(input: CreateMarketDraftInput): Promise<MarketDraftRecord> {
  const rows = await query<MarketDraftRow>(
    `insert into market_drafts(owner_id,question,description,category,resolution_source,close_time,rules)
     values($1,$2,$3,$4,$5,$6,$7)
     returning id,owner_id,question,description,category,resolution_source,close_time,rules,
               state,revision,created_at,updated_at`,
    [input.ownerId,input.question,input.description,input.category,input.resolutionSource,input.closeTime,input.rules],
  );
  return mapDraft(rows[0]);
}
