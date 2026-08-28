import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";
import { attachChallenge, relyingParty } from "@/lib/passkey";
export async function POST(request: Request) { const { rpID } = relyingParty(request); const options = await generateAuthenticationOptions({ rpID, userVerification: "required" }); return attachChallenge(NextResponse.json(options), options.challenge, request); }
