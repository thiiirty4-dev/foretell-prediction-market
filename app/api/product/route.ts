import { NextResponse } from "next/server";
import { addComment, addReport, adminData, connectWallet, dismissReport, favorites, getProductUser, leaderboard, marketProductData, notifications, resolveMarket, toggleFavorite, updateProfile } from "@/db/product";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const view = url.searchParams.get("view") ?? "market"; const user = await getProductUser(request);
    if (view === "market") return NextResponse.json(await marketProductData(url.searchParams.get("marketId") ?? "", user?.id));
    if (view === "leaderboard") return NextResponse.json({ leaderboard: await leaderboard() });
    if (!user) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    if (view === "notifications") return NextResponse.json({ notifications: await notifications(user.id) });
    if (view === "favorites") return NextResponse.json({ favorites: await favorites(user.id) });
    if (view === "admin") return user.isAdmin ? NextResponse.json(await adminData()) : NextResponse.json({ error: "Admin access required" }, { status: 403 });
    return NextResponse.json({ error: "Unknown view" }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load product data" }, { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const user = await getProductUser(request);
    if (!user) return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
    const body = await request.json() as Record<string, unknown>; const action = String(body.action ?? ""); const marketId = String(body.marketId ?? "");
    if (action === "favorite") return NextResponse.json({ favorite: await toggleFavorite(user.id, marketId) });
    if (action === "comment") { const text = String(body.body ?? "").trim(); if (text.length < 2 || text.length > 500) throw new Error("Comment must contain 2 to 500 characters"); await addComment(user.id, marketId, text); return NextResponse.json({ ok: true }); }
    if (action === "report") { const reason = String(body.reason ?? "").trim(); if (reason.length < 5 || reason.length > 300) throw new Error("Report must contain 5 to 300 characters"); await addReport(user.id, marketId, reason); return NextResponse.json({ ok: true }); }
    if (action === "profile") { const bio = String(body.bio ?? "").trim(); if (bio.length > 240) throw new Error("Bio must be 240 characters or fewer"); await updateProfile(user.id, bio); return NextResponse.json({ ok: true }); }
    if (action === "wallet") { const address = String(body.address ?? ""); if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("Invalid wallet address"); await connectWallet(user.id, address); return NextResponse.json({ ok: true }); }
    if (!user.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    if (action === "dismiss-report") { await dismissReport(String(body.reportId ?? "")); return NextResponse.json({ ok: true }); }
    if (action === "resolve") { const outcome = body.outcome === "YES" ? "YES" : body.outcome === "NO" ? "NO" : null; if (!outcome) throw new Error("Choose YES or NO"); await resolveMarket(marketId, outcome); return NextResponse.json({ ok: true }); }
    throw new Error("Unknown action");
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Action failed" }, { status: 400 }); }
}
