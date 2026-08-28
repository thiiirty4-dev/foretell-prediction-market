import { env } from "cloudflare:workers";
import { processMarketAlerts } from "@/db/market-alerts";

export type MarketRecord = {
  id: string; slug: string; title: string; description: string; category: string;
  closesAt: number; yesPrice: number; volume: number; liquidity: number;
  traderCount: number; featured: boolean; status: "open" | "closed"; createdAt: number;
};

export type ActivityRecord = {
  id: string; marketId: string; marketTitle: string; side: "YES" | "NO";
  amount: number; shares: number; price: number; traderAlias: string; createdAt: number;
};

export type UserRecord = { id: string; email: string; displayName: string; createdAt: number };
type UserRow = { id: string; email: string; display_name: string; password_hash: string; password_salt: string; created_at: number };

type MarketRow = {
  id: string; slug: string; title: string; description: string; category: string;
  closes_at: number; yes_price: number; volume: number; liquidity: number;
  trader_count: number; featured: number; status: string; created_at: number;
};

type TradeRow = {
  id: string; market_id: string; market_title: string; side: string; amount: number;
  shares: number; price: number; trader_alias: string; created_at: number;
};

function d1(): D1Database {
  return env.DB as D1Database;
}

let initialized: Promise<void> | null = null;

export function ensureDatabase() {
  initialized ??= initializeDatabase();
  return initialized;
}

async function initializeDatabase() {
  const database = d1();
  await database.batch([
    database.prepare("CREATE TABLE IF NOT EXISTS markets (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, closes_at INTEGER NOT NULL, yes_price INTEGER NOT NULL DEFAULT 50 CHECK (yes_price BETWEEN 1 AND 99), volume INTEGER NOT NULL DEFAULT 0, liquidity INTEGER NOT NULL DEFAULT 1000000, trader_count INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')), created_at INTEGER NOT NULL)"),
    database.prepare("CREATE TABLE IF NOT EXISTS trades (id TEXT PRIMARY KEY, market_id TEXT NOT NULL REFERENCES markets(id), side TEXT NOT NULL CHECK (side IN ('YES','NO')), amount INTEGER NOT NULL CHECK (amount > 0), shares REAL NOT NULL CHECK (shares > 0), price INTEGER NOT NULL CHECK (price BETWEEN 1 AND 99), trader_alias TEXT NOT NULL, created_at INTEGER NOT NULL)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_markets_status_volume ON markets(status, volume DESC)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_markets_created_at ON markets(created_at DESC)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_trades_market_created ON trades(market_id, created_at DESC)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC)"),
    database.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at INTEGER NOT NULL)"),
    database.prepare("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)"),
  ]);

  const tradeColumns = await database.prepare("PRAGMA table_info(trades)").all<{ name: string }>();
  if (!tradeColumns.results.some((column) => column.name === "user_id")) {
    await database.prepare("ALTER TABLE trades ADD COLUMN user_id TEXT REFERENCES users(id)").run();
    await database.prepare("CREATE INDEX IF NOT EXISTS idx_trades_user_created ON trades(user_id, created_at DESC)").run();
  }

  const count = await database.prepare("SELECT COUNT(*) AS count FROM markets").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;

  const now = Date.now();
  const month = 30 * 86_400_000;
  const seeds: Array<Array<string | number>> = [
    ["btc-120k","bitcoin-above-120k","Will Bitcoin trade above $120K before October?","Resolves YES if the Coinbase BTC/USD hourly candle records a high at or above $120,000 before the deadline.","Crypto",now + month,64,284_000_000,5_000_000,4218,1,now - 8_000_000],
    ["open-model","open-source-model-leads","Will an open-source model lead the benchmark by year-end?","Resolves from the public benchmark leaderboard at 23:59 UTC on the closing date.","AI & Tech",now + month * 4,41,98_400_000,3_000_000,1640,0,now - 6_000_000],
    ["fed-cut","fed-cuts-next-meeting","Will the Fed cut rates at the next meeting?","Resolves YES if the target federal funds range is lower after the next scheduled FOMC meeting.","Macro",now + month * 2,73,416_000_000,7_500_000,6291,0,now - 4_000_000],
    ["ar-launch","consumer-ar-launch","Will a major consumer AR product launch this quarter?","Resolves YES if a qualifying product is available for public purchase before quarter end.","AI & Tech",now + month * 3,28,61_200_000,2_000_000,928,0,now - 2_000_000],
  ];
  await database.batch(seeds.map((seed) => database.prepare("INSERT INTO markets (id,slug,title,description,category,closes_at,yes_price,volume,liquidity,trader_count,featured,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'open',?)").bind(...seed)));
}

export async function listMarketData() {
  await ensureDatabase();
  const database = d1();
  const [marketsResult, activityResult] = await Promise.all([
    database.prepare("SELECT * FROM markets WHERE status='open' ORDER BY featured DESC, volume DESC").all<MarketRow>(),
    database.prepare("SELECT t.*, m.title AS market_title FROM trades t JOIN markets m ON m.id=t.market_id ORDER BY t.created_at DESC LIMIT 12").all<TradeRow>(),
  ]);
  return { markets: marketsResult.results.map(mapMarket), activity: activityResult.results.map(mapTrade) };
}

export async function insertMarket(input: { title: string; description: string; category: string; closesAt: number }) {
  await ensureDatabase();
  const database = d1();
  const id = crypto.randomUUID();
  const slugBase = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 54) || "market";
  const slug = slugBase + "-" + id.slice(0, 6);
  const createdAt = Date.now();
  await database.prepare("INSERT INTO markets (id,slug,title,description,category,closes_at,yes_price,volume,liquidity,trader_count,featured,status,created_at) VALUES (?,?,?,?,?,?,50,0,1000000,0,0,'open',?)")
    .bind(id, slug, input.title, input.description, input.category, input.closesAt, createdAt).run();
  return mapMarket((await database.prepare("SELECT * FROM markets WHERE id=?").bind(id).first<MarketRow>())!);
}

export async function insertTrade(input: { marketId: string; side: "YES" | "NO"; amount: number; userId: string; traderAlias: string }) {
  await ensureDatabase();
  const database = d1();
  const row = await database.prepare("SELECT * FROM markets WHERE id=? AND status='open'").bind(input.marketId).first<MarketRow>();
  if (!row) throw new Error("Market is unavailable");
  const amountCents = Math.round(input.amount * 100);
  const impact = Math.max(1, Math.round((amountCents / (row.liquidity + amountCents)) * 30));
  const nextYes = input.side === "YES" ? Math.min(95, row.yes_price + impact) : Math.max(5, row.yes_price - impact);
  const executionPrice = Math.round(input.side === "YES" ? (row.yes_price + nextYes) / 2 : ((100 - row.yes_price) + (100 - nextYes)) / 2);
  const shares = Number((input.amount / (executionPrice / 100)).toFixed(4));
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const alias = input.traderAlias;
  await database.batch([
    database.prepare("UPDATE markets SET yes_price=?, volume=volume+?, liquidity=liquidity+?, trader_count=trader_count+1 WHERE id=?").bind(nextYes, amountCents, Math.round(amountCents / 2), input.marketId),
    database.prepare("INSERT INTO trades (id,market_id,side,amount,shares,price,trader_alias,created_at,user_id) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, input.marketId, input.side, amountCents, shares, executionPrice, alias, createdAt, input.userId),
  ]);
  await processMarketAlerts(input.marketId, nextYes);
  const updated = (await database.prepare("SELECT * FROM markets WHERE id=?").bind(input.marketId).first<MarketRow>())!;
  return { market: mapMarket(updated), activity: mapTrade({ id, market_id: input.marketId, market_title: row.title, side: input.side, amount: amountCents, shares, price: executionPrice, trader_alias: alias, created_at: createdAt }) };
}

export async function findUserByEmail(email: string) { await ensureDatabase(); return d1().prepare("SELECT * FROM users WHERE email=?").bind(email).first<UserRow>(); }

export async function insertUser(input: { email: string; displayName: string; passwordHash: string; passwordSalt: string }) {
  await ensureDatabase();
  const id = crypto.randomUUID(); const createdAt = Date.now();
  await d1().prepare("INSERT INTO users (id,email,display_name,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?)").bind(id, input.email, input.displayName, input.passwordHash, input.passwordSalt, createdAt).run();
  return { id, email: input.email, displayName: input.displayName, createdAt } satisfies UserRecord;
}

export async function createSession(userId: string, tokenHash: string) {
  await ensureDatabase(); const database = d1(); const now = Date.now();
  await database.batch([database.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(now), database.prepare("INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)").bind(tokenHash, userId, now + 30 * 86_400_000, now)]);
}

export async function getSessionUser(tokenHash: string): Promise<UserRecord | null> {
  await ensureDatabase();
  const row = await d1().prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(tokenHash, Date.now()).first<UserRow>();
  return row ? { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at } : null;
}

export async function deleteSession(tokenHash: string) { await ensureDatabase(); await d1().prepare("DELETE FROM sessions WHERE token_hash=?").bind(tokenHash).run(); }

export async function listUserPositions(userId: string) {
  await ensureDatabase();
  const rows = await d1().prepare("SELECT t.market_id, m.title AS market_title, t.side, t.shares, t.amount FROM trades t JOIN markets m ON m.id=t.market_id WHERE t.user_id=? ORDER BY t.created_at DESC").bind(userId).all<{ market_id: string; market_title: string; side: string; shares: number; amount: number }>();
  const positions = new Map<string, { marketId: string; marketTitle: string; yesShares: number; noShares: number; spent: number }>();
  for (const row of rows.results) {
    const position = positions.get(row.market_id) ?? { marketId: row.market_id, marketTitle: row.market_title, yesShares: 0, noShares: 0, spent: 0 };
    if (row.side === "YES") position.yesShares += row.shares; else position.noShares += row.shares;
    position.spent += row.amount / 100; positions.set(row.market_id, position);
  }
  return Array.from(positions.values());
}

function mapMarket(row: MarketRow): MarketRecord {
  return { id:row.id, slug:row.slug, title:row.title, description:row.description, category:row.category, closesAt:row.closes_at, yesPrice:row.yes_price, volume:row.volume, liquidity:row.liquidity, traderCount:row.trader_count, featured:Boolean(row.featured), status:row.status as "open"|"closed", createdAt:row.created_at };
}

function mapTrade(row: TradeRow): ActivityRecord {
  return { id:row.id, marketId:row.market_id, marketTitle:row.market_title, side:row.side as "YES"|"NO", amount:row.amount, shares:row.shares, price:row.price, traderAlias:row.trader_alias, createdAt:row.created_at };
}
