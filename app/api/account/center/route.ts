import { NextResponse } from "next/server";
import { getAccountCenter } from "@/db/account-center";

export async function GET(request: Request) {
  try { const account = await getAccountCenter(request); return account ? NextResponse.json(account) : NextResponse.json({ error: "Log in to open your user center" }, { status: 401 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load user center" }, { status: 400 }); }
}
