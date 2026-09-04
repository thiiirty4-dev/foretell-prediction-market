import "server-only";

import type { QueryResultRow } from "pg";

import { transactionAsUser, query } from "@/lib/db";
import { canonicalHash, type OrderState } from "@/lib/domain";
import type {
  OnchainOrderRecord,
  OrderRecord,
  OutcomeSide,
  SimulationOrderRecord,
  TradeRecord,
  TransactionReceiptRecord,
} from "@/lib/data/types";

interface OnchainOrderRow extends QueryResultRow {
  id: string;
  user_id: string;
  wallet_address: string;
  market_id: string;
  operation: "BUY" | "SELL";
  side: OutcomeSide;
  amount: string;
  state: OrderState;
  transaction_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

interface SimulationOrderRow extends QueryResultRow {
  id: string;
  user_id: string;
  wallet_address: string;
  market_id: string;
  operation: "BUY";
  side: OutcomeSide;
  amount: string;
  execution_price_bps: number;
  estimated_shares: string;
  potential_payout: string;
  state: "SIMULATED";
  idempotency_key: string;
  request_hash: string;
  created_at: Date;
}

interface TradeRow extends QueryResultRow {
  id: string;
  chain_id: number;
  transaction_hash: string;
  log_index: number;
  market_id: string;
  wallet_address: string;
  action: "BUY" | "SELL";
  side: OutcomeSide;
  collateral_amount: string;
  share_amount: string;
  fee_amount: string;
  block_number: string;
  created_at: Date;
}

interface ReceiptRow extends QueryResultRow {
  chain_id: number;
  transaction_hash: string;
  block_number: string | null;
  block_hash: string | null;
  status: number | null;
  confirmations: number;
  canonical: boolean;
  observed_at: Date;
}

export interface CreateSimulationOrderInput {
  userId: string;
  walletAddress: string;
  marketId: string;
  side: OutcomeSide;
  amount: bigint;
  executionPriceBps: number;
  estimatedShares: bigint;
  potentialPayout: bigint;
  idempotencyKey: string;
}

export class SimulationOrderError extends Error {
  constructor(readonly code: "INVALID_SIMULATION_ORDER" | "SIMULATION_IDEMPOTENCY_CONFLICT", message: string) {
    super(message);
  }
}

function boundedLimit(limit = 100): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("limit must be an integer between 1 and 100");
  }
  return limit;
}

function mapOnchainOrder(row: OnchainOrderRow): OnchainOrderRecord {
  return {
    executionMode: "ONCHAIN",
    id: row.id,
    userId: row.user_id,
    walletAddress: row.wallet_address,
    marketId: row.market_id,
    operation: row.operation,
    side: row.side,
    amount: BigInt(row.amount),
    state: row.state,
    transactionHash: row.transaction_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSimulationOrder(row: SimulationOrderRow): SimulationOrderRecord {
  return {
    executionMode: "SIMULATION",
    id: row.id,
    userId: row.user_id,
    walletAddress: row.wallet_address,
    marketId: row.market_id,
    operation: row.operation,
    side: row.side,
    amount: BigInt(row.amount),
    executionPriceBps: row.execution_price_bps,
    estimatedShares: BigInt(row.estimated_shares),
    potentialPayout: BigInt(row.potential_payout),
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}

function validateSimulationOrder(input: CreateSimulationOrderInput): void {
  const address = input.walletAddress.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw new SimulationOrderError("INVALID_SIMULATION_ORDER", "Invalid wallet address");
  if (input.amount <= 0n || input.estimatedShares <= 0n || input.potentialPayout < input.estimatedShares) {
    throw new SimulationOrderError("INVALID_SIMULATION_ORDER", "Simulation quantities must be positive exact integers");
  }
  if (!Number.isInteger(input.executionPriceBps) || input.executionPriceBps < 1 || input.executionPriceBps > 9999) {
    throw new SimulationOrderError("INVALID_SIMULATION_ORDER", "Simulation price must be an integer from 1 to 9999 bps");
  }
  if (input.idempotencyKey.length < 1 || input.idempotencyKey.length > 128) {
    throw new SimulationOrderError("INVALID_SIMULATION_ORDER", "Invalid idempotency key");
  }
}

export async function createSimulationOrder(input: CreateSimulationOrderInput): Promise<SimulationOrderRecord> {
  validateSimulationOrder(input);
  const walletAddress = input.walletAddress.toLowerCase();
  const requestHash = canonicalHash({
    marketId: input.marketId,
    walletAddress,
    side: input.side,
    amount: input.amount.toString(),
    executionPriceBps: input.executionPriceBps,
    estimatedShares: input.estimatedShares.toString(),
    potentialPayout: input.potentialPayout.toString(),
  });

  return transactionAsUser(input.userId, async (client) => {
    const existing = (await client.query<SimulationOrderRow>(
      `select id,user_id,wallet_address,market_id,operation,side,amount::text,
              execution_price_bps,estimated_shares::text,potential_payout::text,
              state,idempotency_key,request_hash,created_at
         from simulation_orders where user_id=$1 and idempotency_key=$2`,
      [input.userId, input.idempotencyKey],
    )).rows[0];
    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new SimulationOrderError("SIMULATION_IDEMPOTENCY_CONFLICT", "Idempotency key was used for different simulation data");
      }
      return mapSimulationOrder(existing);
    }

    const wallet = await client.query(
      `select 1 from user_wallets where user_id=$1 and address=$2 and verified_at is not null`,
      [input.userId, walletAddress],
    );
    if (!wallet.rowCount) throw new SimulationOrderError("INVALID_SIMULATION_ORDER", "Wallet is not verified for this user");

    const market = await client.query(
      `select 1 from markets
        where id=$1 and data_origin='DEMO' and canonical=true and status='OPEN' and close_time>now()`,
      [input.marketId],
    );
    if (!market.rowCount) throw new SimulationOrderError("INVALID_SIMULATION_ORDER", "Demo market is unavailable");

    const rows = (await client.query<SimulationOrderRow>(
      `insert into simulation_orders(
         user_id,wallet_address,market_id,side,amount,execution_price_bps,
         estimated_shares,potential_payout,idempotency_key,request_hash
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id,user_id,wallet_address,market_id,operation,side,amount::text,
                 execution_price_bps,estimated_shares::text,potential_payout::text,
                 state,idempotency_key,request_hash,created_at`,
      [input.userId,walletAddress,input.marketId,input.side,input.amount.toString(),input.executionPriceBps,input.estimatedShares.toString(),input.potentialPayout.toString(),input.idempotencyKey,requestHash],
    )).rows;
    return mapSimulationOrder(rows[0]);
  });
}

export async function listOrdersForUser(userId: string, limit = 100): Promise<OrderRecord[]> {
  const bounded = boundedLimit(limit);
  return transactionAsUser(userId, async (client) => {
    const onchain = (await client.query<OnchainOrderRow>(
      `select id,user_id,wallet_address,market_id,operation,side,amount::text,state,
              transaction_hash,created_at,updated_at
         from orders where user_id=$1 order by created_at desc,id desc limit $2`,
      [userId, bounded],
    )).rows.map(mapOnchainOrder);
    const simulations = (await client.query<SimulationOrderRow>(
      `select id,user_id,wallet_address,market_id,operation,side,amount::text,
              execution_price_bps,estimated_shares::text,potential_payout::text,
              state,idempotency_key,request_hash,created_at
         from simulation_orders where user_id=$1 order by created_at desc,id desc limit $2`,
      [userId, bounded],
    )).rows.map(mapSimulationOrder);
    return [...onchain, ...simulations]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))
      .slice(0, bounded);
  });
}

export async function listTradesForMarket(marketId: string, limit = 100): Promise<TradeRecord[]> {
  const bounded = boundedLimit(limit);
  const rows = await query<TradeRow>(
    `select id,chain_id,transaction_hash,log_index,market_id,wallet_address,action,side,
            collateral_amount::text,share_amount::text,fee_amount::text,block_number::text,created_at
       from trades
      where market_id=$1 and canonical=true
      order by block_number desc,log_index desc
      limit $2`,
    [marketId, bounded],
  );
  return rows.map((row) => ({
    id: row.id,
    chainId: row.chain_id,
    transactionHash: row.transaction_hash,
    logIndex: row.log_index,
    marketId: row.market_id,
    walletAddress: row.wallet_address,
    operation: row.action,
    side: row.side,
    collateralAmount: BigInt(row.collateral_amount),
    shareAmount: BigInt(row.share_amount),
    feeAmount: BigInt(row.fee_amount),
    blockNumber: BigInt(row.block_number),
    createdAt: row.created_at,
  }));
}

export async function listTransactionReceipts(transactionHash: string, limit = 100): Promise<TransactionReceiptRecord[]> {
  const bounded = boundedLimit(limit);
  const rows = await query<ReceiptRow>(
    `select chain_id,transaction_hash,block_number::text,block_hash,status,confirmations,canonical,observed_at
       from transaction_receipts
      where transaction_hash=$1
      order by observed_at desc
      limit $2`,
    [transactionHash.toLowerCase(), bounded],
  );
  return rows.map((row) => ({
    chainId: row.chain_id,
    transactionHash: row.transaction_hash,
    blockNumber: row.block_number === null ? null : BigInt(row.block_number),
    blockHash: row.block_hash,
    status: row.status,
    confirmations: row.confirmations,
    canonical: row.canonical,
    observedAt: row.observed_at,
  }));
}
