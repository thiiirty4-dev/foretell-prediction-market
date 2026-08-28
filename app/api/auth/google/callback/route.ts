import { env } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { createSession } from "@/db/database";
import { findOrCreateGoogleUser } from "@/db/identity";
import { attachSession, createSessionToken, hashSessionToken } from "@/lib/auth";
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
export async function GET(request: Request) {
  const site = new URL(request.url).origin;
  try {
    const secrets = env as unknown as { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }; if (!secrets.GOOGLE_CLIENT_ID || !secrets.GOOGLE_CLIENT_SECRET) throw new Error("Google login is not configured");
    const url = new URL(request.url); const code = url.searchParams.get("code") ?? ""; const state = url.searchParams.get("state") ?? ""; const cookies = parseCookies(request.headers.get("cookie") ?? "");
    if (!code || !state || state !== cookies.foretell_google_state) throw new Error("Google sign-in request expired or was rejected");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: secrets.GOOGLE_CLIENT_ID, client_secret: secrets.GOOGLE_CLIENT_SECRET, redirect_uri: site + "/api/auth/google/callback", grant_type: "authorization_code", code_verifier: cookies.foretell_google_verifier ?? "" }) });
    const tokens = await tokenResponse.json() as { id_token?: string; error_description?: string }; if (!tokenResponse.ok || !tokens.id_token) throw new Error(tokens.error_description || "Google did not return an identity token");
    const verified = await jwtVerify(tokens.id_token, googleKeys, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: secrets.GOOGLE_CLIENT_ID }); const claims = verified.payload;
    if (!claims.sub || typeof claims.email !== "string" || claims.email_verified !== true || claims.nonce !== cookies.foretell_google_nonce) throw new Error("Google could not verify this email address");
    const user = await findOrCreateGoogleUser({ subject: claims.sub, email: claims.email.toLowerCase(), displayName: typeof claims.name === "string" ? claims.name.slice(0, 32) : claims.email.split("@")[0].slice(0, 32) });
    const token = createSessionToken(); await createSession(user.id, await hashSessionToken(token)); const response = attachSession(NextResponse.redirect(new URL("/?auth=google", site)), token, request); clearGoogleCookies(response); return response;
  } catch (error) { const response = NextResponse.redirect(new URL("/?authError=" + encodeURIComponent(error instanceof Error ? error.message : "Google login failed"), site)); clearGoogleCookies(response); return response; }
}
function parseCookies(value: string) { return Object.fromEntries(value.split(";").map((item) => { const at = item.indexOf("="); return at < 0 ? [item.trim(), ""] : [item.slice(0, at).trim(), item.slice(at + 1)]; }).filter(([key]) => key)); }
function clearGoogleCookies(response: NextResponse) { for (const name of ["foretell_google_state", "foretell_google_nonce", "foretell_google_verifier"]) response.cookies.set(name, "", { httpOnly: true, sameSite: "lax", secure: true, path: "/api/auth/google", maxAge: 0 }); }
