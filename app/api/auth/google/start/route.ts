import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax" as const, secure: true, path: "/api/auth/google", maxAge: 600 };
export async function GET(request: Request) {
  const secrets = env as unknown as { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }; const site = new URL(request.url).origin;
  if (!secrets.GOOGLE_CLIENT_ID || !secrets.GOOGLE_CLIENT_SECRET) return NextResponse.redirect(new URL("/?authError=" + encodeURIComponent("Google login is being configured. Use email or a passkey for now."), site));
  const state = randomBase64Url(24); const nonce = randomBase64Url(24); const verifier = randomBase64Url(48); const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth"); url.search = new URLSearchParams({ client_id: secrets.GOOGLE_CLIENT_ID, redirect_uri: site + "/api/auth/google/callback", response_type: "code", scope: "openid email profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" }).toString();
  const response = NextResponse.redirect(url); response.cookies.set("foretell_google_state", state, COOKIE_OPTIONS); response.cookies.set("foretell_google_nonce", nonce, COOKIE_OPTIONS); response.cookies.set("foretell_google_verifier", verifier, COOKIE_OPTIONS); return response;
}
function randomBase64Url(size: number) { return base64Url(crypto.getRandomValues(new Uint8Array(size))); }
function base64Url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
