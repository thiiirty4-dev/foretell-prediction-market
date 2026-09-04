import type { IndexerSyncStatus } from "@/lib/indexer-status";

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  data: T | null;
  error: ApiErrorBody | null;
  meta: Record<string, unknown>;
}

export interface ApiMarketSummary {
  id: string;
  slug: string;
  question: string;
  description: string | null;
  category: string;
  status: string;
  yesProbabilityBps: number;
  noProbabilityBps: number;
  volume: string;
  liquidity: string | null;
  endTime: string;
  dataOrigin: "CHAIN" | "DEMO";
  createdAt: string;
}

export interface ApiPriceHistoryPoint {
  time: string;
  yesPriceBps: number;
  noPriceBps: number;
  dataOrigin: string;
  blockNumber: string | null;
  transactionHash: string | null;
}

export interface ApiMarketDetail extends ApiMarketSummary {
  yesReserve: string | null;
  noReserve: string | null;
  contractAddress: string | null;
  confirmedBlock: string | null;
  resolutionSource: string | null;
  resolutionRules: string | null;
  outcomes: Array<{
    id: string;
    side: "YES" | "NO";
    positionId: string | null;
    payoutNumerator: string | null;
  }>;
  priceHistory: ApiPriceHistoryPoint[];
}

export interface ApiMarketListData {
  items: ApiMarketSummary[];
}

export interface ApiMarketHistoryData {
  marketId: string;
  slug: string;
  dataOrigin: "CHAIN" | "DEMO";
  confirmedBlock: string | null;
  items: ApiPriceHistoryPoint[];
}

export type ApiIndexerStatus = IndexerSyncStatus;

export interface ApiMockOrder {
  id: string;
  marketId: string;
  walletAddress: string;
  operation: "BUY";
  outcome: "YES" | "NO";
  amount: string;
  executionPriceBps: number;
  estimatedShares: string;
  potentialPayout: string;
  state: "SIMULATED";
  executionMode: "SIMULATION";
  createdAt: string;
}

export interface ApiOrderListData {
  items: ApiMockOrder[];
}

export interface ApiSimulationPosition {
  marketId: string;
  marketSlug: string;
  marketQuestion: string;
  marketStatus: string;
  yesQuantity: string;
  noQuantity: string;
  costBasis: string;
  potentialPayout: string;
  lastOrderId: string;
  updatedAt: string;
}

export interface ApiPortfolio {
  mode: "SIMULATION";
  source: "POSTGRES_SIMULATION_PROJECTION";
  walletAddress: string;
  testnetOnly: true;
  hasMonetaryValue: false;
  totalCostBasis: string;
  totalPotentialPayout: string;
  positionCount: number;
  positions: ApiSimulationPosition[];
}
