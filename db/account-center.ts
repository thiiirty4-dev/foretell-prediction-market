import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/database";
import { ensureCommunityDatabase } from "@/db/community";
import { ensureIdentityDatabase } from "@/db/identity";
import { getProductUser } from "@/db/product";

function d1() { return env.DB as D1Database; }

export async function getAccountCenter(request: Request) {
  const user = await getProductUser(request); if (!user) return null;
  await Promise.all([ensureDatabase(), ensureCommunityDatabase(), ensureIdentityDatabase()]);
  const database = d1();
  const [tradeStats, socialStats, securityStats, recentTrades] = await Promise.all([
    database.prepare("SELECT COUNT(*) AS orders, COUNT(DISTINCT market_id) AS markets, COALESCE(SUM(amount),0) AS spent_cents, COALESCE(SUM(shares),0) AS shares FROM trades WHERE user_id=?").bind(user.id).first<{ orders: number; markets: number; spent_cents: number; shares: number }>(),
    database.prepare("SELECT (SELECT COUNT(*) FROM community_posts WHERE user_id=?) AS posts, (SELECT COUNT(*) FROM profile_follows WHERE following_id=?) AS followers, (SELECT COUNT(*) FROM profile_follows WHERE follower_id=?) AS following").bind(user.id, user.id, user.id).first<{ posts: number; followers: number; following: number }>(),
    database.prepare("SELECT COUNT(*) AS passkeys FROM passkey_credentials WHERE user_id=?").bind(user.id).first<{ passkeys: number }>(),
    database.prepare("SELECT t.id,t.side,t.amount,t.shares,t.price,t.created_at,m.title AS market_title FROM trades t JOIN markets m ON m.id=t.market_id WHERE t.user_id=? ORDER BY t.created_at DESC LIMIT 8").bind(user.id).all<{ id: string; side: string; amount: number; shares: number; price: number; created_at: number; market_title: string }>(),
  ]);
  const completion = [Boolean(user.bio), Boolean(user.walletAddress), Boolean(securityStats?.passkeys), Boolean(tradeStats?.orders)].filter(Boolean).length;
  return {
    user,
    stats: { balance: user.balance, orders: tradeStats?.orders ?? 0, markets: tradeStats?.markets ?? 0, spent: (tradeStats?.spent_cents ?? 0) / 100, shares: tradeStats?.shares ?? 0, posts: socialStats?.posts ?? 0, followers: socialStats?.followers ?? 0, following: socialStats?.following ?? 0, passkeys: securityStats?.passkeys ?? 0 },
    completion: completion * 25,
    recentTrades: recentTrades.results.map((trade) => ({ id: trade.id, side: trade.side, amount: trade.amount / 100, shares: trade.shares, price: trade.price, createdAt: trade.created_at, marketTitle: trade.market_title })),
  };
}
