import "server-only";

import type { QueryResultRow } from "pg";

import { query } from "@/lib/db";
import type { IndexerCheckpointSnapshot } from "@/lib/indexer-status";

interface IndexerCheckpointRow extends QueryResultRow {
  current_block: string;
  updated_at: Date;
  block_timestamp: Date | null;
}

export async function getIndexerCheckpoint(chainId: number): Promise<IndexerCheckpointSnapshot | null> {
  const rows = await query<IndexerCheckpointRow>(
    `select checkpoint.current_block::text,
            checkpoint.updated_at,
            block.block_timestamp
       from indexer_runtime_checkpoints checkpoint
       left join indexed_blocks block
         on block.chain_id = checkpoint.chain_id
        and block.number = checkpoint.current_block
        and block.hash = checkpoint.current_hash
        and block.canonical = true
      where checkpoint.chain_id = $1
      limit 1`,
    [chainId],
  );
  const checkpoint = rows[0];
  if (!checkpoint) return null;

  return {
    currentBlock: checkpoint.current_block,
    updatedAt: checkpoint.updated_at.toISOString(),
    blockTimestamp: checkpoint.block_timestamp?.toISOString() ?? null,
  };
}
