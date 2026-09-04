import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { IndexerSyncStatus } from "@/lib/indexer-status";

export type ApiMeta = { requestId: string; asOfBlock?: string; confirmedAt?: string; source?: string; stale?: boolean; nextCursor?: string | null; indexer?: IndexerSyncStatus };
export function requestId(request: Request): string { return request.headers.get("x-request-id") ?? crypto.randomUUID(); }
export function ok<T>(data: T, meta: ApiMeta, status = 200): NextResponse { return NextResponse.json({ data, error: null, meta }, { status }); }
export function fail(request: Request, status: number, code: string, message: string, details?: unknown): NextResponse {
  return NextResponse.json({ data: null, error: { code, message, ...(details ? { details } : {}) }, meta: { requestId: requestId(request) } }, { status });
}
export function apiError(request: Request, error: unknown): NextResponse {
  if (error instanceof ZodError) return fail(request, 400, "VALIDATION_ERROR", "请求参数无效", error.issues);
  if (error instanceof ApiException) return fail(request, error.status, error.code, error.message);
  if (error instanceof SyntaxError) return fail(request, 400, "INVALID_JSON", "请求体必须是有效 JSON");
  console.error("api_error", { requestId: requestId(request), error: error instanceof Error ? error.message : "unknown" });
  return fail(request, 500, "INTERNAL_ERROR", "服务器暂时无法处理请求");
}
export class ApiException extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
