import { generateRegistrationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { listPasskeys } from "@/db/identity";
import { attachChallenge, currentUser, relyingParty } from "@/lib/passkey";
export async function POST(request: Request) {
  const user = await currentUser(request); if (!user) return NextResponse.json({ error: "Log in before adding a passkey" }, { status: 401 });
  const { rpID, rpName } = relyingParty(request); const existing = await listPasskeys(user.id);
  const options = await generateRegistrationOptions({ rpName, rpID, userID: new TextEncoder().encode(user.id), userName: user.email, userDisplayName: user.displayName, attestationType: "none", excludeCredentials: existing.map((credential) => ({ id: credential.id, transports: credential.transports })), authenticatorSelection: { residentKey: "required", userVerification: "required" }, supportedAlgorithmIDs: [-7, -257] });
  return attachChallenge(NextResponse.json(options), options.challenge, request);
}
