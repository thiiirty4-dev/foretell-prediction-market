import { env } from "cloudflare:workers";
import { ensureDatabase, getSessionUser, type UserRecord } from "@/db/database";
import { hashSessionToken, sessionTokenFromRequest } from "@/lib/auth";

export type ProductUser = UserRecord & { isAdmin: boolean; walletAddress: string; bio: string; balance: number };
let initialized: Promise<void> | null = null;
const db = () => env.DB as D1Database;

export function ensureProductDatabase() { initialized ??= initialize(); return initialized; }

async function initialize() {
  await ensureDatabase();
  const database = db();
  await database.batch([
    database.prepare("CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, bio TEXT NOT NULL DEFAULT '', wallet_address TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')), updated_at INTEGER NOT NULL)"),
    database.prepare("CREATE TABLE IF NOT EXISTS point_accounts (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, balance_cents INTEGER NOT NULL DEFAULT 1000000 CHECK(balance_cents>=0), updated_at INTEGER NOT NULL)"),
    database.prepare("CREATE TABLE IF NOT EXISTS price_history (id TEXT PRIMARY KEY, market_id TEXT NOT NULL REFERENCES markets(id), yes_price INTEGER NOT NULL, created_at INTEGER NOT NULL)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_price_market_time ON price_history(market_id,created_at DESC)"),
    database.prepare("CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, market_id TEXT NOT NULL REFERENCES markets(id), user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'visible', created_at INTEGER NOT NULL)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_comments_market_time ON comments(market_id,created_at DESC)"),
    database.prepare("CREATE TABLE IF NOT EXISTS favorites (user_id TEXT NOT NULL REFERENCES users(id), market_id TEXT NOT NULL REFERENCES markets(id), created_at INTEGER NOT NULL, PRIMARY KEY(user_id,market_id))"),
    database.prepare("CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_notifications_user_time ON notifications(user_id,created_at DESC)"),
    database.prepare("CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, market_id TEXT NOT NULL REFERENCES markets(id), user_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_reports_status_time ON reports(status,created_at DESC)"),
    database.prepare("CREATE TABLE IF NOT EXISTS market_governance (market_id TEXT PRIMARY KEY REFERENCES markets(id), creator_user_id TEXT REFERENCES users(id), resolution_source TEXT NOT NULL DEFAULT 'Publicly verifiable sources', outcome TEXT, review_status TEXT NOT NULL DEFAULT 'approved', updated_at INTEGER NOT NULL)"),
  ]);
  await database.prepare("INSERT OR IGNORE INTO price_history (id,market_id,yes_price,created_at) SELECT 'seed-'||id,id,yes_price,created_at FROM markets").run();
}

export async function getProductUser(request: Request): Promise<ProductUser | null> {
  const token = sessionTokenFromRequest(request);
  if (!token) return null;
  const user = await getSessionUser(await hashSessionToken(token));
  return user ? ensureProductUser(user) : null;
}

export async function ensureProductUser(user: UserRecord): Promise<ProductUser> {
  await ensureProductDatabase();
  const database = db(); const now = Date.now();
  const count = await database.prepare("SELECT COUNT(*) AS count FROM profiles").first<{ count: number }>();
  await database.batch([
    database.prepare("INSERT OR IGNORE INTO profiles (user_id,bio,wallet_address,role,updated_at) VALUES (?,?,?, ?,?)").bind(user.id, "", "", (count?.count ?? 0) === 0 ? "admin" : "user", now),
    database.prepare("INSERT OR IGNORE INTO point_accounts (user_id,balance_cents,updated_at) VALUES (?,1000000,?)").bind(user.id, now),
  ]);
  const state = await database.prepare("SELECT p.bio,p.wallet_address,p.role,a.balance_cents FROM profiles p JOIN point_accounts a ON a.user_id=p.user_id WHERE p.user_id=?").bind(user.id).first<{ bio: string; wallet_address: string; role: string; balance_cents: number }>();
  return { ...user, isAdmin: state?.role === "admin", walletAddress: state?.wallet_address ?? "", bio: state?.bio ?? "", balance: (state?.balance_cents ?? 1_000_000) / 100 };
}

export async function debitPoints(userId: string, dollars: number) {
  await ensureProductDatabase(); const cents = Math.round(dollars * 100);
  const result = await db().prepare("UPDATE point_accounts SET balance_cents=balance_cents-?,updated_at=? WHERE user_id=? AND balance_cents>=?").bind(cents, Date.now(), userId, cents).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function refundPoints(userId: string, dollars: number) { await db().prepare("UPDATE point_accounts SET balance_cents=balance_cents+?,updated_at=? WHERE user_id=?").bind(Math.round(dollars * 100), Date.now(), userId).run(); }
export async function pointBalance(userId: string) { const row = await db().prepare("SELECT balance_cents FROM point_accounts WHERE user_id=?").bind(userId).first<{ balance_cents: number }>(); return (row?.balance_cents ?? 0) / 100; }

export async function recordTrade(userId: string, marketId: string, marketTitle: string, yesPrice: number, side: string, amount: number) {
  const now = Date.now(); const database = db();
  await database.batch([
    database.prepare("INSERT INTO price_history (id,market_id,yes_price,created_at) VALUES (?,?,?,?)").bind(crypto.randomUUID(), marketId, yesPrice, now),
    database.prepare("INSERT INTO notifications (id,user_id,title,body,is_read,created_at) VALUES (?,?,?,?,0,?)").bind(crypto.randomUUID(), userId, "Order filled", `${side} order for $${amount.toFixed(0)} filled in ${marketTitle}.`, now),
  ]);
}

export async function recordMarketCreated(userId: string, marketId: string, source = "Publicly verifiable sources") {
  await ensureProductDatabase(); const now = Date.now();
  await db().batch([
    db().prepare("INSERT OR REPLACE INTO market_governance (market_id,creator_user_id,resolution_source,outcome,review_status,updated_at) VALUES (?,?,?,NULL,'approved',?)").bind(marketId, userId, source, now),
    db().prepare("INSERT INTO price_history (id,market_id,yes_price,created_at) VALUES (?,?,50,?)").bind(crypto.randomUUID(), marketId, now),
  ]);
}

export async function marketProductData(marketId: string, userId?: string) {
  await ensureProductDatabase(); const database = db();
  const [history, comments, governance, favorite] = await Promise.all([
    database.prepare("SELECT yes_price AS yesPrice,created_at AS createdAt FROM (SELECT yes_price,created_at FROM price_history WHERE market_id=? ORDER BY created_at DESC LIMIT 60) ORDER BY created_at").bind(marketId).all(),
    database.prepare("SELECT c.id,c.body,c.created_at AS createdAt,u.display_name AS displayName,p.role FROM comments c JOIN users u ON u.id=c.user_id LEFT JOIN profiles p ON p.user_id=u.id WHERE c.market_id=? AND c.status='visible' ORDER BY c.created_at DESC LIMIT 50").bind(marketId).all(),
    database.prepare("SELECT resolution_source AS resolutionSource,outcome,review_status AS reviewStatus FROM market_governance WHERE market_id=?").bind(marketId).first(),
    userId ? database.prepare("SELECT 1 AS saved FROM favorites WHERE user_id=? AND market_id=?").bind(userId, marketId).first() : null,
  ]);
  return { history: history.results, comments: comments.results, governance, favorite: Boolean(favorite) };
}

export async function leaderboard() {
  await ensureProductDatabase();
  const result = await db().prepare("SELECT u.id,u.display_name AS displayName,p.wallet_address AS walletAddress,COUNT(t.id) AS trades,COALESCE(SUM(t.amount),0) AS volumeCents,a.balance_cents AS balanceCents FROM users u JOIN profiles p ON p.user_id=u.id JOIN point_accounts a ON a.user_id=u.id LEFT JOIN trades t ON t.user_id=u.id GROUP BY u.id ORDER BY volumeCents DESC,trades DESC LIMIT 50").all();
  return result.results;
}

export async function notifications(userId: string) { await ensureProductDatabase(); const result = await db().prepare("SELECT id,title,body,is_read AS isRead,created_at AS createdAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(userId).all(); await db().prepare("UPDATE notifications SET is_read=1 WHERE user_id=?").bind(userId).run(); return result.results; }

export async function favorites(userId: string) { await ensureProductDatabase(); const result = await db().prepare("SELECT m.id,m.title,m.category,m.yes_price AS yesPrice,m.volume,m.closes_at AS closesAt FROM favorites f JOIN markets m ON m.id=f.market_id WHERE f.user_id=? ORDER BY f.created_at DESC").bind(userId).all(); return result.results; }

export async function toggleFavorite(userId: string, marketId: string) {
  await ensureProductDatabase(); const database = db();
  const found = await database.prepare("SELECT 1 FROM favorites WHERE user_id=? AND market_id=?").bind(userId, marketId).first();
  if (found) { await database.prepare("DELETE FROM favorites WHERE user_id=? AND market_id=?").bind(userId, marketId).run(); return false; }
  await database.prepare("INSERT INTO favorites (user_id,market_id,created_at) VALUES (?,?,?)").bind(userId, marketId, Date.now()).run(); return true;
}

export async function addComment(userId: string, marketId: string, body: string) { await ensureProductDatabase(); await db().prepare("INSERT INTO comments (id,market_id,user_id,body,status,created_at) VALUES (?,?,?,?,'visible',?)").bind(crypto.randomUUID(), marketId, userId, body, Date.now()).run(); }
export async function addReport(userId: string, marketId: string, reason: string) { await ensureProductDatabase(); await db().prepare("INSERT INTO reports (id,market_id,user_id,reason,status,created_at) VALUES (?,?,?,?,'open',?)").bind(crypto.randomUUID(), marketId, userId, reason, Date.now()).run(); }
export async function updateProfile(userId: string, bio: string) { await ensureProductDatabase(); await db().prepare("UPDATE profiles SET bio=?,updated_at=? WHERE user_id=?").bind(bio, Date.now(), userId).run(); }
export async function connectWallet(userId: string, address: string) { await ensureProductDatabase(); await db().prepare("UPDATE profiles SET wallet_address=?,updated_at=? WHERE user_id=?").bind(address.toLowerCase(), Date.now(), userId).run(); }

export async function adminData() {
  await ensureProductDatabase(); const database = db();
  const [metrics, reports, markets] = await Promise.all([
    database.prepare("SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM markets) AS markets,(SELECT COUNT(*) FROM trades) AS trades,(SELECT COUNT(*) FROM comments WHERE status='visible') AS comments,(SELECT COUNT(*) FROM reports WHERE status='open') AS openReports").first(),
    database.prepare("SELECT r.id,r.market_id AS marketId,r.reason,r.created_at AS createdAt,m.title,u.display_name AS reporter FROM reports r JOIN markets m ON m.id=r.market_id JOIN users u ON u.id=r.user_id WHERE r.status='open' ORDER BY r.created_at DESC LIMIT 50").all(),
    database.prepare("SELECT id,title,closes_at AS closesAt,status FROM markets ORDER BY created_at DESC LIMIT 50").all(),
  ]);
  return { metrics, reports: reports.results, markets: markets.results };
}

export async function dismissReport(reportId: string) { await db().prepare("UPDATE reports SET status='dismissed' WHERE id=?").bind(reportId).run(); }

export async function resolveMarket(marketId: string, outcome: "YES" | "NO") {
  await ensureProductDatabase(); const database = db(); const now = Date.now();
  const market = await database.prepare("SELECT title,status FROM markets WHERE id=?").bind(marketId).first<{ title: string; status: string }>();
  if (!market || market.status !== "open") throw new Error("Market is not open");
  const winners = await database.prepare("SELECT user_id AS userId,SUM(shares) AS shares FROM trades WHERE market_id=? AND side=? AND user_id IS NOT NULL GROUP BY user_id").bind(marketId, outcome).all<{ userId: string; shares: number }>();
  const statements = [
    database.prepare("UPDATE markets SET status='closed',yes_price=? WHERE id=?").bind(outcome === "YES" ? 99 : 1, marketId),
    database.prepare("INSERT OR REPLACE INTO market_governance (market_id,creator_user_id,resolution_source,outcome,review_status,updated_at) VALUES (?,(SELECT creator_user_id FROM market_governance WHERE market_id=?),COALESCE((SELECT resolution_source FROM market_governance WHERE market_id=?),'Publicly verifiable sources'),?,'resolved',?)").bind(marketId, marketId, marketId, outcome, now),
  ];
  for (const winner of winners.results) {
    const payout = Math.round(winner.shares * 100);
    statements.push(database.prepare("UPDATE point_accounts SET balance_cents=balance_cents+?,updated_at=? WHERE user_id=?").bind(payout, now, winner.userId));
    statements.push(database.prepare("INSERT INTO notifications (id,user_id,title,body,is_read,created_at) VALUES (?,?,?,?,0,?)").bind(crypto.randomUUID(), winner.userId, "Market resolved", `${market.title} resolved ${outcome}. Your payout was $${(payout / 100).toFixed(2)}.`, now));
  }
  await database.batch(statements);
}
