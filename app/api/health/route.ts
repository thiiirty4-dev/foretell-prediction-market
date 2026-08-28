import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
export async function GET() {
  try { await (env.DB as D1Database).prepare("SELECT 1").first(); return NextResponse.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ status: "degraded", database: "unavailable" }, { status: 503 }); }
}
