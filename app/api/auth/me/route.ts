import { NextResponse } from "next/server";
import { listUserPositions } from "@/db/database";
import { getProductUser } from "@/db/product";
export async function GET(request: Request) { const user = await getProductUser(request); return NextResponse.json(user ? { user, positions: await listUserPositions(user.id), balance: user.balance } : { user: null, positions: [], balance: 10000 }); }
