import { NextResponse } from "next/server";
import { getSessionUser, listUserPositions } from "@/db/database";
import { hashSessionToken, sessionTokenFromRequest } from "@/lib/auth";
export async function GET(request: Request) { const token = sessionTokenFromRequest(request); if (!token) return NextResponse.json({ user: null, positions: [] }); const user = await getSessionUser(await hashSessionToken(token)); return NextResponse.json(user ? { user, positions: await listUserPositions(user.id) } : { user: null, positions: [] }); }
