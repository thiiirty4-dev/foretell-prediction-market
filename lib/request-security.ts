import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

let initialized: Promise<unknown> | null = null;
function ensureTable() {
  initialized ??= (env.DB as D1Database).prepare("CREATE TABLE IF NOT EXISTS request_limits (key TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, PRIMARY KEY (key, bucket))").run();
  return initialized;
}
async function fingerprint(request: Request, scope: string) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope + ":" + ip));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function protectMutation(request: Request, scope: string, limit: number, windowMs: number) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin) return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 65536) return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  try {
    await ensureTable();
    const now = Date.now(); const bucket = Math.floor(now / windowMs); const key = await fingerprint(request, scope);
    const row = await (env.DB as D1Database).prepare("INSERT INTO request_limits (key,bucket,count,expires_at) VALUES (?1,?2,1,?3) ON CONFLICT(key,bucket) DO UPDATE SET count=count+1 RETURNING count").bind(key, bucket, now + windowMs * 2).first<{ count: number }>();
    if ((row?.count ?? 1) > limit) return NextResponse.json({ error: "Too many requests. Please wait and try again." }, { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } });
    return null;
  } catch { return NextResponse.json({ error: "Request protection is temporarily unavailable" }, { status: 503 }); }
}
