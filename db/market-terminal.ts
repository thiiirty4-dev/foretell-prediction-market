import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/database";
import { getProductUser } from "@/db/product";
import { ensureMarketAlerts, listMarketAlerts } from "@/db/market-alerts";

function d1() { return env.DB as D1Database; }
export async function getMarketTerminal(request: Request, marketId: string) {
  await Promise.all([ensureDatabase(), ensureMarketAlerts()]); const viewer = await getProductUser(request); const database = d1();
  const market = await database.prepare("SELECT id,title,category,yes_price,liquidity,volume FROM markets WHERE id=?").bind(marketId).first<{ id: string; title: string; category: string; yes_price: number; liquidity: number; volume: number }>();
  if (!market) throw new Error("Market not found");
  const [trades, holders, related, alerts] = await Promise.all([
    database.prepare("SELECT t.id,t.side,t.amount,t.shares,t.price,t.created_at,COALESCE(u.display_name,t.trader_alias) AS trader FROM trades t LEFT JOIN users u ON u.id=t.user_id WHERE t.market_id=? ORDER BY t.created_at DESC LIMIT 20").bind(marketId).all<{ id: string; side: string; amount: number; shares: number; price: number; created_at: number; trader: string }>(),
    database.prepare("SELECT COALESCE(t.user_id,t.trader_alias) AS holder_id,COALESCE(u.display_name,t.trader_alias) AS holder,SUM(CASE WHEN t.side='YES' THEN t.shares ELSE 0 END) AS yes_shares,SUM(CASE WHEN t.side='NO' THEN t.shares ELSE 0 END) AS no_shares,SUM(t.amount) AS invested FROM trades t LEFT JOIN users u ON u.id=t.user_id WHERE t.market_id=? GROUP BY holder_id,holder ORDER BY invested DESC LIMIT 8").bind(marketId).all<{ holder_id: string; holder: string; yes_shares: number; no_shares: number; invested: number }>(),
    database.prepare("SELECT id,title,yes_price,volume FROM markets WHERE category=? AND id<>? AND status='open' ORDER BY volume DESC LIMIT 4").bind(market.category, marketId).all<{ id: string; title: string; yes_price: number; volume: number }>(),
    viewer ? listMarketAlerts(viewer.id, marketId) : Promise.resolve([]),
  ]);
  return {
    book: buildDepth(market.yes_price, market.liquidity),
    spread: buildDepth(market.yes_price, market.liquidity).spread,
    trades: trades.results.map((trade) => ({ id: trade.id, side: trade.side, amount: trade.amount / 100, shares: trade.shares, price: trade.price, createdAt: trade.created_at, trader: trade.trader })),
    holders: holders.results.map((holder) => ({ id: holder.holder_id, name: holder.holder, yesShares: holder.yes_shares, noShares: holder.no_shares, invested: holder.invested / 100 })),
    related: related.results.map((item) => ({ id: item.id, title: item.title, yesPrice: item.yes_price, volume: item.volume })), alerts,
  };
}

function buildDepth(mid: number, liquidity: number) {
  const spread = Math.max(2, Math.min(8, Math.round(4_000_000 / Math.max(liquidity, 1)))); const half = Math.ceil(spread / 2); const base = Math.max(50, Math.round(liquidity / 20_000));
  const bids = Array.from({ length: 5 }, (_, index) => ({ price: Math.max(1, mid - half - index), size: base * (index + 1) }));
  const asks = Array.from({ length: 5 }, (_, index) => ({ price: Math.min(99, mid + half + index), size: base * (index + 1) }));
  return { bids, asks, spread: asks[0].price - bids[0].price, midpoint: mid };
}
