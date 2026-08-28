CREATE TABLE IF NOT EXISTS community_posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, market_id TEXT REFERENCES markets(id) ON DELETE SET NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS community_likes (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, post_id));
CREATE INDEX IF NOT EXISTS idx_community_likes_post ON community_likes(post_id);
CREATE TABLE IF NOT EXISTS profile_follows (follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, PRIMARY KEY (follower_id, following_id), CHECK (follower_id <> following_id));
CREATE INDEX IF NOT EXISTS idx_profile_follows_following ON profile_follows(following_id);
