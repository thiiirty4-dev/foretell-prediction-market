import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const markets = sqliteTable("markets", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  closesAt: integer("closes_at").notNull(),
  yesPrice: integer("yes_price").notNull().default(50),
  volume: integer("volume").notNull().default(0),
  liquidity: integer("liquidity").notNull().default(1_000_000),
  traderCount: integer("trader_count").notNull().default(0),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("open"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_markets_status_volume").on(table.status, table.volume),
  index("idx_markets_created_at").on(table.createdAt),
]);

export const trades = sqliteTable("trades", {
  id: text("id").primaryKey(),
  marketId: text("market_id").notNull().references(() => markets.id),
  side: text("side").notNull(),
  amount: integer("amount").notNull(),
  shares: real("shares").notNull(),
  price: integer("price").notNull(),
  traderAlias: text("trader_alias").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_trades_market_created").on(table.marketId, table.createdAt),
  index("idx_trades_created_at").on(table.createdAt),
]);

