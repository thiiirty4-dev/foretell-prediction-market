import { NextResponse } from "next/server";
import { getSessionUser, insertMarket, listMarketData } from "@/db/database";
import { hashSessionToken, sessionTokenFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
const categories = new Set(["Crypto", "AI & Tech", "Macro", "Culture", "Science"]);

export async function GET() {
  try {
    return NextResponse.json(await listMarketData(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Market database is unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const token = sessionTokenFromRequest(request);
    const user = token ? await getSessionUser(await hashSessionToken(token)) : null;
    if (!user) return NextResponse.json({ error: "Sign in to publish a market" }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const category = typeof body.category === "string" ? body.category : "";
    const closesAt = typeof body.closesAt === "number" ? body.closesAt : 0;
    if (title.length < 12 || title.length > 160) throw new Error("Question must contain 12 to 160 characters");
    if (description.length < 20 || description.length > 400) throw new Error("Resolution criteria must contain 20 to 400 characters");
    if (!categories.has(category)) throw new Error("Choose a supported category");
    if (!Number.isSafeInteger(closesAt) || closesAt < Date.now() + 3_600_000 || closesAt > Date.now() + 3 * 365 * 86_400_000) throw new Error("Choose a valid future close date");
    return NextResponse.json({ market: await insertMarket({ title, description, category, closesAt }) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid market" }, { status: 400 });
  }
}
