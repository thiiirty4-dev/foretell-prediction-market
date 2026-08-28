import { NextResponse } from "next/server";
import { insertTrade } from "@/db/database";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const marketId = typeof body.marketId === "string" ? body.marketId : "";
    const side = body.side === "YES" || body.side === "NO" ? body.side : null;
    const amount = typeof body.amount === "number" ? body.amount : Number.NaN;
    if (!marketId || !side) throw new Error("Select a valid market outcome");
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000) throw new Error("Order amount must be between $1 and $1,000");
    return NextResponse.json(await insertTrade({ marketId, side, amount }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid order" }, { status: 400 });
  }
}

