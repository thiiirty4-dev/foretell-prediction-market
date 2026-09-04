import { NextResponse } from "next/server";
import { getMockPortfolio } from "@/lib/services/portfolio-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function envelope<T>(data: T, status = 200) {
  return NextResponse.json(
    {
      data,
      error: null,
      meta: {
        requestId: crypto.randomUUID(),
        generatedAt: new Date().toISOString(),
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function GET() {
  try {
    return envelope(await getMockPortfolio());
  } catch {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "PORTFOLIO_UNAVAILABLE",
          message: "The simulation portfolio is temporarily unavailable.",
        },
        meta: {
          requestId: crypto.randomUUID(),
          generatedAt: new Date().toISOString(),
        },
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}