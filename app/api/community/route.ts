import { NextResponse } from "next/server";
import { communityAction, listCommunity } from "@/db/community";

export async function GET(request: Request) {
  try { const mode = new URL(request.url).searchParams.get("mode") === "following" ? "following" : "latest"; return NextResponse.json(await listCommunity(request, mode)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load community" }, { status: 400 }); }
}

export async function POST(request: Request) {
  try { return NextResponse.json(await communityAction(request, await request.json() as Record<string, unknown>)); }
  catch (error) { const message = error instanceof Error ? error.message : "Community action failed"; return NextResponse.json({ error: message === "ACCOUNT_REQUIRED" ? "Log in to join the community" : message }, { status: message === "ACCOUNT_REQUIRED" ? 401 : 400 }); }
}
