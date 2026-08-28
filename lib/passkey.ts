import { NextResponse } from "next/server";
import { getSessionUser } from "@/db/database";
import { hashSessionToken, sessionTokenFromRequest } from "@/lib/auth";

export const PASSKEY_CHALLENGE_COOKIE = "foretell_passkey_challenge";
export async function currentUser(request: Request) { const token = sessionTokenFromRequest(request); return token ? getSessionUser(await hashSessionToken(token)) : null; }
export function relyingParty(request: Request) { const url = new URL(request.url); return { rpID: url.hostname, origin: url.origin, rpName: "Foretell Markets" }; }
export function challengeFromRequest(request: Request) { const cookie = request.headers.get("cookie") ?? ""; return cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(PASSKEY_CHALLENGE_COOKIE + "="))?.slice(PASSKEY_CHALLENGE_COOKIE.length + 1) ?? ""; }
export function attachChallenge(response: NextResponse, challenge: string, request: Request) { response.cookies.set(PASSKEY_CHALLENGE_COOKIE, challenge, { httpOnly: true, sameSite: "strict", secure: new URL(request.url).protocol === "https:", path: "/api/auth/passkey", maxAge: 300 }); return response; }
export function clearChallenge(response: NextResponse, request: Request) { response.cookies.set(PASSKEY_CHALLENGE_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: new URL(request.url).protocol === "https:", path: "/api/auth/passkey", maxAge: 0 }); return response; }
