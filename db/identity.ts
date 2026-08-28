import { env } from "cloudflare:workers";
import { ensureDatabase, findUserByEmail, insertUser, type UserRecord } from "@/db/database";
import { hashPassword } from "@/lib/auth";

export type StoredPasskey = {
  id: string; userId: string; publicKey: Uint8Array; webauthnUserId: string; counter: number;
  deviceType: "singleDevice" | "multiDevice"; backedUp: boolean;
  transports?: Array<"ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb">;
};

type PasskeyRow = { id: string; user_id: string; public_key: ArrayBuffer; webauthn_user_id: string; counter: number; device_type: "singleDevice" | "multiDevice"; backed_up: number; transports: string | null };
function d1() { return env.DB as D1Database; }
let identityInitialized: Promise<void> | null = null;

export function ensureIdentityDatabase() { identityInitialized ??= initializeIdentityDatabase(); return identityInitialized; }
async function initializeIdentityDatabase() {
  await ensureDatabase(); const database = d1();
  await database.batch([
    database.prepare("CREATE TABLE IF NOT EXISTS auth_identities (provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, email TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (provider, provider_user_id))"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id)"),
    database.prepare("CREATE TABLE IF NOT EXISTS passkey_credentials (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, public_key BLOB NOT NULL, webauthn_user_id TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0, device_type TEXT NOT NULL, backed_up INTEGER NOT NULL DEFAULT 0, transports TEXT, created_at INTEGER NOT NULL)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkey_credentials(user_id)"),
  ]);
}

export async function listPasskeys(userId: string) { await ensureIdentityDatabase(); const result = await d1().prepare("SELECT * FROM passkey_credentials WHERE user_id=? ORDER BY created_at DESC").bind(userId).all<PasskeyRow>(); return result.results.map(mapPasskey); }
export async function findPasskey(id: string) { await ensureIdentityDatabase(); const row = await d1().prepare("SELECT * FROM passkey_credentials WHERE id=?").bind(id).first<PasskeyRow>(); return row ? mapPasskey(row) : null; }
export async function insertPasskey(input: StoredPasskey) {
  await ensureIdentityDatabase();
  const key = input.publicKey.buffer.slice(input.publicKey.byteOffset, input.publicKey.byteOffset + input.publicKey.byteLength);
  await d1().prepare("INSERT INTO passkey_credentials (id,user_id,public_key,webauthn_user_id,counter,device_type,backed_up,transports,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(input.id, input.userId, key, input.webauthnUserId, input.counter, input.deviceType, input.backedUp ? 1 : 0, input.transports?.join(",") ?? null, Date.now()).run();
}
export async function updatePasskeyCounter(id: string, counter: number) { await ensureIdentityDatabase(); await d1().prepare("UPDATE passkey_credentials SET counter=? WHERE id=?").bind(counter, id).run(); }

export async function findOrCreateGoogleUser(input: { subject: string; email: string; displayName: string }) {
  await ensureIdentityDatabase(); const database = d1();
  const linked = await database.prepare("SELECT u.* FROM auth_identities i JOIN users u ON u.id=i.user_id WHERE i.provider='google' AND i.provider_user_id=?").bind(input.subject).first<{ id: string; email: string; display_name: string; created_at: number }>();
  if (linked) return mapUser(linked);
  const existing = await findUserByEmail(input.email);
  let user: UserRecord | null = existing ? { id: existing.id, email: existing.email, displayName: existing.display_name, createdAt: existing.created_at } : null;
  if (!user) {
    const placeholder = await hashPassword(crypto.randomUUID() + crypto.randomUUID());
    try { user = await insertUser({ email: input.email, displayName: input.displayName, passwordHash: placeholder.hash, passwordSalt: placeholder.salt }); }
    catch { const raced = await findUserByEmail(input.email); if (raced) user = { id: raced.id, email: raced.email, displayName: raced.display_name, createdAt: raced.created_at }; }
  }
  if (!user) throw new Error("Unable to create the Google account");
  await database.prepare("INSERT OR IGNORE INTO auth_identities (provider,provider_user_id,user_id,email,created_at) VALUES ('google',?,?,?,?)").bind(input.subject, user.id, input.email, Date.now()).run();
  return user;
}

function mapPasskey(row: PasskeyRow): StoredPasskey { return { id: row.id, userId: row.user_id, publicKey: new Uint8Array(row.public_key), webauthnUserId: row.webauthn_user_id, counter: row.counter, deviceType: row.device_type, backedUp: Boolean(row.backed_up), transports: row.transports ? row.transports.split(",") as StoredPasskey["transports"] : undefined }; }
function mapUser(row: { id: string; email: string; display_name: string; created_at: number }): UserRecord { return { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at }; }
