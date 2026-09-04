import "server-only";
import { PrivyClient } from "@privy-io/server-auth";
import { config } from "@/lib/config";
import { ApiException } from "@/lib/http";
import { query } from "@/lib/db";

export type Principal = { id: string; privyDid: string; role: "USER" | "OPERATOR" | "RESOLVER" | "RESOLUTION_ADMIN" };
type PrincipalRow = { id: string; privy_did: string; role: Principal["role"] };
let privy: PrivyClient | undefined;

export async function authenticate(request: Request): Promise<Principal> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new ApiException(401, "UNAUTHENTICATED", "需要登录");
  const c = config();
  privy ??= new PrivyClient(c.PRIVY_APP_ID ?? c.NEXT_PUBLIC_PRIVY_APP_ID, c.PRIVY_APP_SECRET);
  let claims: Awaited<ReturnType<PrivyClient["verifyAuthToken"]>>;
  try { claims = await privy.verifyAuthToken(token); } catch { throw new ApiException(401, "INVALID_TOKEN", "登录凭证无效或已过期"); }
  const rows = await query<PrincipalRow>(`select id,privy_did,role from authenticate_app_user($1)`, [claims.userId]);
  return { id: rows[0].id, privyDid: rows[0].privy_did, role: rows[0].role };
}

export function requireRole(principal: Principal, ...roles: Principal["role"][]): void {
  if (!roles.includes(principal.role)) throw new ApiException(403, "FORBIDDEN", "权限不足");
}
