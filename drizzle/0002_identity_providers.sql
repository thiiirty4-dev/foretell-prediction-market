CREATE TABLE IF NOT EXISTS auth_identities (provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, email TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (provider, provider_user_id));
CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);
CREATE TABLE IF NOT EXISTS passkey_credentials (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, public_key BLOB NOT NULL, webauthn_user_id TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0, device_type TEXT NOT NULL, backed_up INTEGER NOT NULL DEFAULT 0, transports TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkey_credentials(user_id);
