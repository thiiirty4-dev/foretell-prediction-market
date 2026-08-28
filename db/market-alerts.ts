import { env } from "cloudflare:workers";

function d1() { return env.DB as D1Database; }
let initialized: Promise<void> | null = null;
export function ensureMarketAlerts() { initialized ??= d1().batch([
  d1().prepare("CREATE TABLE IF NOT EXISTS market_alerts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE, direction TEXT NOT NULL CHECK (direction IN ('above','below')), threshold INTEGER NOT NULL CHECK (threshold BETWEEN 1 AND 99), is_active INTEGER NOT NULL DEFAULT 1, triggered_at INTEGER, created_at INTEGER NOT NULL)"),
  d1().prepare("CREATE INDEX IF NOT EXISTS idx_market_alerts_user ON market_alerts(user_id, created_at DESC)"),
  d1().prepare("CREATE INDEX IF NOT EXISTS idx_market_alerts_market_active ON market_alerts(market_id, is_active)"),
]).then(() => undefined); return initialized; }

export async function listMarketAlerts(userId: string, marketId: string) { await ensureMarketAlerts(); const result = await d1().prepare("SELECT id,direction,threshold,is_active,triggered_at,created_at FROM market_alerts WHERE user_id=? AND market_id=? ORDER BY created_at DESC LIMIT 8").bind(userId, marketId).all<{ id: string; direction: string; threshold: number; is_active: number; triggered_at: number | null; created_at: number }>(); return result.results.map((row) => ({ id: row.id, direction: row.direction, threshold: row.threshold, active: Boolean(row.is_active), triggeredAt: row.triggered_at, createdAt: row.created_at })); }

export async function createMarketAlert(userId: string, marketId: string, direction: "above" | "below", threshold: number) {
  await ensureMarketAlerts(); const database = d1(); const id = crypto.randomUUID();
  await database.batch([database.prepare("UPDATE market_alerts SET is_active=0 WHERE user_id=? AND market_id=? AND direction=? AND is_active=1").bind(userId, marketId, direction), database.prepare("INSERT INTO market_alerts (id,user_id,market_id,direction,threshold,is_active,created_at) VALUES (?,?,?,?,?,1,?)").bind(id, userId, marketId, direction, threshold, Date.now())]);
  return { id, direction, threshold, active: true };
}

export async function deleteMarketAlert(userId: string, id: string) { await ensureMarketAlerts(); const result = await d1().prepare("DELETE FROM market_alerts WHERE id=? AND user_id=?").bind(id, userId).run(); return Boolean(result.meta.changes); }

export async function processMarketAlerts(marketId: string, yesPrice: number) {
  await ensureMarketAlerts(); const database = d1(); const alerts = await database.prepare("SELECT id FROM market_alerts WHERE market_id=? AND is_active=1 AND ((direction='above' AND ? >= threshold) OR (direction='below' AND ? <= threshold))").bind(marketId, yesPrice, yesPrice).all<{ id: string }>();
  if (alerts.results.length) await database.batch(alerts.results.map((alert) => database.prepare("UPDATE market_alerts SET is_active=0,triggered_at=? WHERE id=?").bind(Date.now(), alert.id)));
}
