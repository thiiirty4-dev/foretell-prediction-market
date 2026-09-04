export const MARKET_CATEGORIES = ["All", "Politics", "Crypto", "Sports", "Technology", "Culture"] as const;

export type MarketCategory = (typeof MARKET_CATEGORIES)[number];
export type SpecificMarketCategory = Exclude<MarketCategory, "All">;
export type MarketStatus = "OPEN" | "CLOSING_SOON" | "NEW";

export interface MarketHistoryPoint {
  label: string;
  yesProbability: number;
}

export interface MarketPreview {
  id: string;
  title: string;
  category: SpecificMarketCategory;
  status: MarketStatus;
  yesProbability: number;
  noProbability: number;
  change24h?: number | null;
  volume: string;
  closesAt: string;
  createdAt: string;
  trending: boolean;
  newMarket: boolean;
  description?: string;
  resolutionCriteria?: string;
  liquidity?: string;
  history?: readonly MarketHistoryPoint[];
}
