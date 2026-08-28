import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { insertPasskey } from "@/db/identity";
import { challengeFromRequest, clearChallenge, currentUser, relyingParty } from "@/lib/passkey";
export async function POST(request: Request) {
  try {
    const user = await currentUser(request); if (!user) return NextResponse.json({ error: "Your session expired. Log in and try again." }, { status: 401 });
    const challenge = challengeFromRequest(request); if (!challenge) throw new Error("Passkey registration expired. Try again.");
    const body = await request.json() as RegistrationResponseJSON; const { rpID, origin } = relyingParty(request);
    const verification = await verifyRegistrationResponse({ response: body, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
    if (!verification.verified || !verification.registrationInfo) throw new Error("The passkey could not be verified");
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    await insertPasskey({ id: credential.id, userId: user.id, publicKey: credential.publicKey, webauthnUserId: user.id, counter: credential.counter, deviceType: credentialDeviceType, backedUp: credentialBackedUp, transports: credential.transports });
    return clearChallenge(NextResponse.json({ verified: true }), request);
  } catch (error) { return clearChallenge(NextResponse.json({ error: error instanceof Error ? error.message : "Passkey registration failed" }, { status: 400 }), request); }
}
