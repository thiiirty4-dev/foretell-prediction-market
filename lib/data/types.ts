import type { OrderState } from "@/lib/domain";

export type MarketDataOrigin = "CHAIN" | "DEMO";
export type MarketLifecycleState = "OPEN" | "CLOSED" | "PROPOSED" | "DISPUTED" | "RESOLVED" | "CANCELLED";
export type OutcomeSide = "YES" | "NO";
export type OrderOperation = "BUY" | "SELL";

export interface MarketRecord {
  id: string;
  slug: string | null;
  question: string;
  description: string;
  category: string;
  resolutionSource: string;
  rules: string;
  closeTime: Date;
  status: MarketLifecycleState;
  yesProbabilityBps: number;
  noProbabilityBps: number;
  volume: bigint;
  liquidity: bigint | null;
  yesReserve: bigint | null;
  noReserve: bigint | null;
  contractAddress: string | null;
  confirmedBlock: bigint | null;
  dataOrigin: MarketDataOrigin;
  createdAt: Date;
}

export interface MarketOutcomeRecord {
  id: string;
  marketId: string;
  side: OutcomeSide;
  positionId: bigint | null;
  payoutNumerator: bigint | null;
}

export interface MarketDraftRecord {
  id: string;
  ownerId: string;
  question: string;
  description: string;
  category: string;
  resolutionSource: string;
  closeTime: Date;
  rules: string;
  state: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "PUBLISHED";
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PriceHistoryRecord {
  marketId: string;
  dataOrigin: MarketDataOrigin;
  yesProbabilityBps: number;
  blockNumber: bigint | null;
  transactionHash: string | null;
  observedAt: Date;
}

export interface UserRecord {
  id: string;
  privyDid: string;
  displayName: string | null;
  role: "USER" | "OPERATOR" | "RESOLVER" | "RESOLUTION_ADMIN";
  createdAt: Date;
  lastSeenAt: Date;
}

export interface WalletRecord {
  id: string;
  userId: string;
  address: string;
  privyVerified: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
}

export interface AssetBalanceRecord {
  walletAddress: string;
  balance: bigint;
  asOfBlock: bigint;
  confirmedAt: Date;
  updatedAt: Date;
}

export interface PositionRecord {
  marketId: string;
  marketQuestion: string;
  walletAddress: string;
  yesQuantity: bigint;
  noQuantity: bigint;
  costBasis: bigint;
  realizedPnl: bigint;
  asOfBlock: bigint;
  updatedAt: Date;
}

export interface OnchainOrderRecord {
  executionMode: "ONCHAIN";
  id: string;
  userId: string;
  walletAddress: string;
  marketId: string;
  operation: OrderOperation;
  side: OutcomeSide;
  amount: bigint;
  state: OrderState;
  transactionHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SimulationOrderRecord {
  executionMode: "SIMULATION";
  id: string;
  userId: string;
  walletAddress: string;
  marketId: string;
  operation: "BUY";
  side: OutcomeSide;
  amount: bigint;
  executionPriceBps: number;
  estimatedShares: bigint;
  potentialPayout: bigint;
  state: "SIMULATED";
  createdAt: Date;
  updatedAt: Date;
}

export type OrderRecord = OnchainOrderRecord | SimulationOrderRecord;

export interface TradeRecord {
  id: string;
  chainId: number;
  transactionHash: string;
  logIndex: number;
  marketId: string;
  walletAddress: string;
  operation: OrderOperation;
  side: OutcomeSide;
  collateralAmount: bigint;
  shareAmount: bigint;
  feeAmount: bigint;
  blockNumber: bigint;
  createdAt: Date;
}

export interface TransactionReceiptRecord {
  chainId: number;
  transactionHash: string;
  blockNumber: bigint | null;
  blockHash: string | null;
  status: number | null;
  confirmations: number;
  canonical: boolean;
  observedAt: Date;
}
