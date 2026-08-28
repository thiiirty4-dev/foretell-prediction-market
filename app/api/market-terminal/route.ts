import { NextResponse } from "next/server";
import { getProductUser } from "@/db/product";
import { createMarketAlert, deleteMarketAlert } from "@/db/market-alerts";
import { getMarketTerminal } from "@/db/market-terminal";

export async function GET(request: Request) { try { const marketId = new URL(request.url).searchParams.get("marketId") ?? ""; if (!marketId) throw new Error("Market is required"); return NextResponse.json(await getMarketTerminal(request, marketId)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load market terminal" }, { status: 400 }); } }
export async function POST(request: Request) {
  try { const user = await getProductUser(request); if (!user) return NextResponse.json({ error: "Log in to manage price alerts" }, { status: 401 }); const body = await request.json() as Record<string, unknown>; const action = body.action;
    if (action === "delete-alert") { const id = typeof body.id === "string" ? body.id : ""; if (!id || !(await deleteMarketAlert(user.id, id))) throw new Error("Alert not found"); return NextResponse.json({ deleted: true }); }
    const marketId = typeof body.marketId === "string" ? body.marketId : ""; const direction = body.direction === "below" ? "below" : "above"; const threshold = Math.round(Number(body.threshold)); if (!marketId || !Number.isFinite(threshold) || threshold < 1 || threshold > 99) throw new Error("Choose a probability from 1 to 99"); return NextResponse.json(await createMarketAlert(user.id, marketId, direction, threshold));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save alert" }, { status: 400 }); }
}
