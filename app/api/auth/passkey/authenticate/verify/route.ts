import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { createSession, getSessionUser } from "@/db/database";
import { findPasskey, updatePasskeyCounter } from "@/db/identity";
import { attachSession, createSessionToken, hashSessionToken } from "@/lib/auth";
import { challengeFromRequest, clearChallenge, relyingParty } from "@/lib/passkey";
export async function POST(request: Request) {
  try {
    const challenge = challengeFromRequest(request); if (!challenge) throw new Error("Passkey login expired. Try again.");
    const body = await request.json() as AuthenticationResponseJSON; const passkey = await findPasskey(body.id); if (!passkey) throw new Error("This passkey is not registered with Foretell");
    const { rpID, origin } = relyingParty(request);
    const verification = await verifyAuthenticationResponse({ response: body, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true, credential: { id: passkey.id, publicKey: passkey.publicKey, counter: passkey.counter, transports: passkey.transports } });
    if (!verification.verified) throw new Error("The passkey could not be verified");
    await updatePasskeyCounter(passkey.id, verification.authenticationInfo.newCounter);
    const token = createSessionToken(); const tokenHash = await hashSessionToken(token); await createSession(passkey.userId, tokenHash); const user = await getSessionUser(tokenHash);
    return attachSession(clearChallenge(NextResponse.json({ verified: true, user }), request), token, request);
  } catch (error) { return clearChallenge(NextResponse.json({ error: error instanceof Error ? error.message : "Passkey login failed" }, { status: 400 }), request); }
}
