import { NextResponse } from "next/server";
import { createSession, findUserByEmail, listUserPositions } from "@/db/database";
import { attachSession, createSessionToken, hashSessionToken, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const row = await findUserByEmail(email);
    if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) return NextResponse.json({ error: "Email or password is incorrect" }, { status: 401 });
    const user = { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at };
    const token = createSessionToken(); await createSession(user.id, await hashSessionToken(token));
    return attachSession(NextResponse.json({ user, positions: await listUserPositions(user.id) }), token, request);
  } catch { return NextResponse.json({ error: "Unable to sign in" }, { status: 400 }); }
}
