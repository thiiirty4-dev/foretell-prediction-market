import { env } from "cloudflare:workers";

export type MarketRecord = {
  id: string; slug: string; title: string; description: string; category: string;
  closesAt: number; yesPrice: number; volume: number; liquidity: number;
  traderCount: number; featured: boolean; status: "open" | "closed"; createdAt: number;
};

export type ActivityRecord = {
  id: string; marketId: string; marketTitle: string; side: "YES" | "NO";
  amount: number; shares: number; price: number; traderAlias: string; createdAt: number;
};

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
  ]);

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

export async function insertTrade(input: { marketId: string; side: "YES" | "NO"; amount: number }) {
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
  const alias = "guest-" + id.slice(0, 4);
  await database.batch([
    database.prepare("UPDATE markets SET yes_price=?, volume=volume+?, liquidity=liquidity+?, trader_count=trader_count+1 WHERE id=?").bind(nextYes, amountCents, Math.round(amountCents / 2), input.marketId),
    database.prepare("INSERT INTO trades (id,market_id,side,amount,shares,price,trader_alias,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, input.marketId, input.side, amountCents, shares, executionPrice, alias, createdAt),
  ]);
  const updated = (await database.prepare("SELECT * FROM markets WHERE id=?").bind(input.marketId).first<MarketRow>())!;
  return { market: mapMarket(updated), activity: mapTrade({ id, market_id: input.marketId, market_title: row.title, side: input.side, amount: amountCents, shares, price: executionPrice, trader_alias: alias, created_at: createdAt }) };
}

function mapMarket(row: MarketRow): MarketRecord {
  return { id:row.id, slug:row.slug, title:row.title, description:row.description, category:row.category, closesAt:row.closes_at, yesPrice:row.yes_price, volume:row.volume, liquidity:row.liquidity, traderCount:row.trader_count, featured:Boolean(row.featured), status:row.status as "open"|"closed", createdAt:row.created_at };
}

function mapTrade(row: TradeRow): ActivityRecord {
  return { id:row.id, marketId:row.market_id, marketTitle:row.market_title, side:row.side as "YES"|"NO", amount:row.amount, shares:row.shares, price:row.price, traderAlias:row.trader_alias, createdAt:row.created_at };
}

