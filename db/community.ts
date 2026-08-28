import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/database";
import { getProductUser } from "@/db/product";

type FeedMode = "latest" | "following";
type CommunityRow = {
  id: string; user_id: string; display_name: string; market_id: string | null; market_title: string | null;
  body: string; created_at: number; like_count: number; follower_count: number; liked: number; following: number;
};

function d1() { return env.DB as D1Database; }
let initialized: Promise<void> | null = null;

export function ensureCommunityDatabase() { initialized ??= initializeCommunityDatabase(); return initialized; }

async function initializeCommunityDatabase() {
  await ensureDatabase(); const database = d1();
  await database.batch([
    database.prepare("CREATE TABLE IF NOT EXISTS community_posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, market_id TEXT REFERENCES markets(id) ON DELETE SET NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(created_at DESC)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts(user_id, created_at DESC)"),
    database.prepare("CREATE TABLE IF NOT EXISTS community_likes (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, post_id))"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_community_likes_post ON community_likes(post_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS profile_follows (follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, PRIMARY KEY (follower_id, following_id), CHECK (follower_id <> following_id))"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_profile_follows_following ON profile_follows(following_id)"),
  ]);
}

export async function listCommunity(request: Request, mode: FeedMode) {
  await ensureCommunityDatabase(); const viewer = await getProductUser(request); const viewerId = viewer?.id ?? "";
  if (mode === "following" && !viewer) return { posts: [], mode, requiresAccount: true };
  const feedFilter = mode === "following" ? "AND (p.user_id=? OR EXISTS (SELECT 1 FROM profile_follows feed_follow WHERE feed_follow.follower_id=? AND feed_follow.following_id=p.user_id))" : "";
  const sql = `SELECT p.id,p.user_id,u.display_name,p.market_id,m.title AS market_title,p.body,p.created_at,
    (SELECT COUNT(*) FROM community_likes cl WHERE cl.post_id=p.id) AS like_count,
    (SELECT COUNT(*) FROM profile_follows pf WHERE pf.following_id=p.user_id) AS follower_count,
    CASE WHEN ?<>'' AND EXISTS (SELECT 1 FROM community_likes mine WHERE mine.user_id=? AND mine.post_id=p.id) THEN 1 ELSE 0 END AS liked,
    CASE WHEN ?<>'' AND EXISTS (SELECT 1 FROM profile_follows own_follow WHERE own_follow.follower_id=? AND own_follow.following_id=p.user_id) THEN 1 ELSE 0 END AS following
    FROM community_posts p JOIN users u ON u.id=p.user_id LEFT JOIN markets m ON m.id=p.market_id
    WHERE 1=1 ${feedFilter} ORDER BY p.created_at DESC LIMIT 40`;
  const values = mode === "following" ? [viewerId, viewerId, viewerId, viewerId, viewerId, viewerId] : [viewerId, viewerId, viewerId, viewerId];
  const result = await d1().prepare(sql).bind(...values).all<CommunityRow>();
  return { posts: result.results.map((row) => ({ id: row.id, authorId: row.user_id, authorName: row.display_name, initials: initials(row.display_name), marketId: row.market_id, marketTitle: row.market_title, body: row.body, createdAt: row.created_at, likeCount: row.like_count, followerCount: row.follower_count, liked: Boolean(row.liked), following: Boolean(row.following), viewerIsAuthor: row.user_id === viewerId })), mode, requiresAccount: false };
}

export async function communityAction(request: Request, input: Record<string, unknown>) {
  await ensureCommunityDatabase(); const user = await getProductUser(request); if (!user) throw new Error("ACCOUNT_REQUIRED");
  const action = typeof input.action === "string" ? input.action : "";
  if (action === "publish") {
    const body = typeof input.body === "string" ? input.body.trim() : ""; const marketId = typeof input.marketId === "string" && input.marketId ? input.marketId : null;
    if (body.length < 3 || body.length > 400) throw new Error("Write between 3 and 400 characters");
    if (marketId && !(await d1().prepare("SELECT id FROM markets WHERE id=?").bind(marketId).first())) throw new Error("The linked market is unavailable");
    await d1().prepare("INSERT INTO community_posts (id,user_id,market_id,body,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), user.id, marketId, body, Date.now()).run();
    return { published: true };
  }
  if (action === "like") {
    const postId = typeof input.postId === "string" ? input.postId : ""; const active = Boolean(input.active); if (!postId) throw new Error("Post is required");
    if (active) await d1().prepare("INSERT OR IGNORE INTO community_likes (user_id,post_id,created_at) VALUES (?,?,?)").bind(user.id, postId, Date.now()).run();
    else await d1().prepare("DELETE FROM community_likes WHERE user_id=? AND post_id=?").bind(user.id, postId).run();
    return { liked: active };
  }
  if (action === "follow") {
    const profileId = typeof input.profileId === "string" ? input.profileId : ""; const active = Boolean(input.active); if (!profileId || profileId === user.id) throw new Error("Choose another community member");
    if (active) await d1().prepare("INSERT OR IGNORE INTO profile_follows (follower_id,following_id,created_at) VALUES (?,?,?)").bind(user.id, profileId, Date.now()).run();
    else await d1().prepare("DELETE FROM profile_follows WHERE follower_id=? AND following_id=?").bind(user.id, profileId).run();
    return { following: active };
  }
  if (action === "delete") {
    const postId = typeof input.postId === "string" ? input.postId : ""; if (!postId) throw new Error("Post is required");
    const result = await d1().prepare("DELETE FROM community_posts WHERE id=? AND user_id=?").bind(postId, user.id).run();
    if (!result.meta.changes) throw new Error("Post not found or permission denied");
    return { deleted: true };
  }
  throw new Error("Unsupported community action");
}

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "FM"; }
