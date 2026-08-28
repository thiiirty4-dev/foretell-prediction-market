import { NextResponse } from "next/server";
import { createSession, findUserByEmail, insertUser } from "@/db/database";
import { attachSession, createSessionToken, hashPassword, hashSessionToken } from "@/lib/auth";
import { protectMutation } from "@/lib/request-security";

export async function POST(request: Request) {
  try {
    const blocked = await protectMutation(request, "register", 5, 600_000); if (blocked) return blocked;
    const body = await request.json() as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw new Error("Enter a valid email address");
    if (displayName.length < 2 || displayName.length > 32) throw new Error("Name must contain 2 to 32 characters");
    if (password.length < 8 || password.length > 72) throw new Error("Password must contain 8 to 72 characters");
    if (await findUserByEmail(email)) return NextResponse.json({ error: "An account already exists for this email" }, { status: 409 });
    const passwordData = await hashPassword(password);
    const user = await insertUser({ email, displayName, passwordHash: passwordData.hash, passwordSalt: passwordData.salt });
    const token = createSessionToken(); await createSession(user.id, await hashSessionToken(token));
    return attachSession(NextResponse.json({ user, positions: [] }, { status: 201 }), token, request);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create account" }, { status: 400 }); }
}
