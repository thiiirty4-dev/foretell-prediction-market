import { apiError, ok, requestId } from "@/lib/http";
import { idempotencyKey, mockOrderInput, mockOrderListQuery } from "@/lib/schemas";
import { createMockOrder, listMockOrders } from "@/lib/services/mock-order-service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = mockOrderListQuery.parse({ limit: url.searchParams.get("limit") || undefined });
    const orders = await listMockOrders(query.limit);
    return ok({ items: orders }, {
      requestId: requestId(request),
      source: "postgres_demo_orders",
    });
  } catch (error) {
    return apiError(request, error);
  }
}

export async function POST(request: Request) {
  try {
    const key = idempotencyKey.parse(request.headers.get("idempotency-key") ?? "");
    const body = mockOrderInput.parse(await request.json());
    const order = await createMockOrder(body, key);
    return ok(order, {
      requestId: requestId(request),
      source: "postgres_demo_orders",
    }, 201);
  } catch (error) {
    return apiError(request, error);
  }
}
