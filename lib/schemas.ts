import { z } from "zod";
export const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((v) => v.toLowerCase());
export const amount = z.string().regex(/^(0|[1-9]\d*)$/);
export const cursor = z.string().max(256).optional();
export const marketDraft = z.object({
  question: z.string().trim().min(10).max(240), description: z.string().trim().min(20).max(5000),
  category: z.string().trim().min(2).max(48), resolutionSource: z.string().url().max(1000),
  closeTime: z.string().datetime(), rules: z.string().trim().min(20).max(5000)
});
export const orderInput = z.object({ marketId: z.string().uuid(), wallet: address, side: z.enum(["YES","NO"]), action: z.enum(["BUY","SELL"]), amount: amount, slippageBps: z.number().int().min(1).max(2000), deadline: z.string().datetime() });

export const marketIdentifier = z.string().trim().min(1).max(100)
  .regex(/^[a-zA-Z0-9-]+$/)
  .transform((value) => value.toLowerCase());
export const marketSort = z.enum(["trending", "volume", "newest", "ending-soon"]);
export const marketApiStatus = z.enum(["OPEN", "CLOSED", "PROPOSED", "DISPUTED", "RESOLVED", "CANCELLED"]);
export const marketListQuery = z.object({
  cursor: z.string().min(1).max(1024).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(48).optional(),
  status: marketApiStatus.optional(),
  sort: marketSort.default("trending"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const marketHistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export const mockOrderListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
export const mockOrderInput = z.object({
  marketId: marketIdentifier,
  outcome: z.enum(["YES", "NO"]),
  amount: z.string().regex(/^[1-9]\d*$/).max(78),
});
export const idempotencyKey = z.string().min(1).max(128);
