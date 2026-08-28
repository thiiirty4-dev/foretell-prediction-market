import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
export async function GET() { const secrets = env as unknown as { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }; return NextResponse.json({ google: Boolean(secrets.GOOGLE_CLIENT_ID && secrets.GOOGLE_CLIENT_SECRET), passkey: true }); }
