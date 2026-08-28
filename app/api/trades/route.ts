import { NextResponse } from "next/server";
import { insertTrade } from "@/db/database";
import { debitPoints, getProductUser, pointBalance, recordTrade, refundPoints } from "@/db/product";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getProductUser(request);
    if (!user) return NextResponse.json({ error: "Sign in to place a simulated order" }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const marketId = typeof body.marketId === "string" ? body.marketId : "";
    const side = body.side === "YES" || body.side === "NO" ? body.side : null;
    const amount = typeof body.amount === "number" ? body.amount : Number.NaN;
    if (!marketId || !side) throw new Error("Select a valid market outcome");
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000) throw new Error("Order amount must be between $1 and $1,000");
    if (!(await debitPoints(user.id, amount))) throw new Error("Insufficient play-money balance");
    try {
      const result = await insertTrade({ marketId, side, amount, userId: user.id, traderAlias: user.displayName });
      await recordTrade(user.id, marketId, result.market.title, result.market.yesPrice, side, amount);
      return NextResponse.json({ ...result, balance: await pointBalance(user.id) });
    } catch (error) { await refundPoints(user.id, amount); throw error; }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid order" }, { status: 400 });
  }
}
