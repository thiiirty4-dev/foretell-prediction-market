import { NextResponse } from "next/server";
import { deleteSession } from "@/db/database";
import { clearSession, hashSessionToken, sessionTokenFromRequest } from "@/lib/auth";
export async function POST(request: Request) { const token = sessionTokenFromRequest(request); if (token) await deleteSession(await hashSessionToken(token)); return clearSession(NextResponse.json({ ok: true })); }
