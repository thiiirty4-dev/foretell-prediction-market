import { createHash } from "node:crypto";
import { ApiException } from "@/lib/http";

export const ORDER_STATES = ["PREPARED","AWAITING_SIGNATURE","SUBMITTED","CONFIRMING","CONFIRMED","INDEXED","EXPIRED","REJECTED","REPLACED","DROPPED","FAILED","REORGED","ORPHANED"] as const;
export type OrderState = typeof ORDER_STATES[number];
const transitions: Record<OrderState, readonly OrderState[]> = {
  PREPARED: ["AWAITING_SIGNATURE","EXPIRED"], AWAITING_SIGNATURE: ["SUBMITTED","REJECTED"],
  SUBMITTED: ["CONFIRMING","REPLACED","DROPPED"], CONFIRMING: ["CONFIRMED","FAILED","REPLACED"],
  CONFIRMED: ["INDEXED","REORGED"], INDEXED: ["ORPHANED"], REORGED: ["CONFIRMING","FAILED"],
  EXPIRED: [], REJECTED: [], REPLACED: [], DROPPED: [], FAILED: [], ORPHANED: ["CONFIRMING", "FAILED"]
};
export function assertTransition(from: OrderState, to: OrderState): void {
  if (!transitions[from].includes(to)) throw new ApiException(409, "ILLEGAL_ORDER_TRANSITION", `订单不能从 ${from} 变为 ${to}`);
}
export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function integerString(value: string): string { if (!/^(0|[1-9]\d*)$/.test(value)) throw new ApiException(400,"INVALID_AMOUNT","金额必须是非负整数最小单位"); return value; }

