import "server-only";

import {
  createSimulationOrder,
  getMarket,
  listOrdersForUser,
  listVerifiedWallets,
  SimulationOrderError,
  type SimulationOrderRecord,
} from "@/lib/data";
import { ApiException } from "@/lib/http";

const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001";
const MOCK_WALLET_ADDRESS = "0x1111111111111111111111111111111111111111";
const MAX_MOCK_AMOUNT = 100_000n * 1_000_000n;

export interface MockOrderInput {
  marketId: string;
  outcome: "YES" | "NO";
  amount: string;
}

function orderDto(order: SimulationOrderRecord) {
  return {
    id: order.id,
    marketId: order.marketId,
    walletAddress: order.walletAddress,
    operation: order.operation,
    outcome: order.side,
    amount: order.amount.toString(),
    executionPriceBps: order.executionPriceBps,
    estimatedShares: order.estimatedShares.toString(),
    potentialPayout: order.potentialPayout.toString(),
    state: order.state,
    executionMode: order.executionMode,
    createdAt: order.createdAt.toISOString(),
  };
}

export async function listMockOrders(limit: number) {
  const orders = await listOrdersForUser(MOCK_USER_ID, limit);
  return orders
    .filter((order): order is SimulationOrderRecord => order.executionMode === "SIMULATION")
    .map(orderDto);
}

export async function createMockOrder(input: MockOrderInput, key: string) {
  const market = await getMarket(input.marketId);
  if (!market) throw new ApiException(404, "MARKET_NOT_FOUND", "市场不存在");
  if (market.dataOrigin !== "DEMO") throw new ApiException(409, "MOCK_MARKET_REQUIRED", "本阶段只能创建 demo 市场模拟订单");
  if (market.status !== "OPEN" || market.closeTime.getTime() <= Date.now()) {
    throw new ApiException(409, "MARKET_CLOSED", "市场当前不可创建模拟订单");
  }

  const amount = BigInt(input.amount);
  if (amount <= 0n || amount > MAX_MOCK_AMOUNT) {
    throw new ApiException(400, "INVALID_AMOUNT", "金额必须大于 0 且不超过 100,000 fUSD 的最小单位值");
  }
  const executionPriceBps = input.outcome === "YES" ? market.yesProbabilityBps : market.noProbabilityBps;
  if (executionPriceBps <= 0 || executionPriceBps >= 10000) {
    throw new ApiException(409, "PRICE_UNAVAILABLE", "当前 outcome 没有可用模拟价格");
  }
  const estimatedShares = (amount * 10_000n) / BigInt(executionPriceBps);
  if (estimatedShares <= 0n) throw new ApiException(400, "AMOUNT_TOO_SMALL", "金额过小，无法产生模拟份额");

  const wallets = await listVerifiedWallets(MOCK_USER_ID);
  if (!wallets.some((wallet) => wallet.address === MOCK_WALLET_ADDRESS)) {
    throw new ApiException(503, "DEMO_CONTEXT_UNAVAILABLE", "Mock Wallet 尚未初始化，请先运行数据库 seed");
  }

  try {
    return orderDto(await createSimulationOrder({
      userId: MOCK_USER_ID,
      walletAddress: MOCK_WALLET_ADDRESS,
      marketId: market.id,
      side: input.outcome,
      amount,
      executionPriceBps,
      estimatedShares,
      potentialPayout: estimatedShares,
      idempotencyKey: key,
    }));
  } catch (error) {
    if (error instanceof SimulationOrderError) {
      if (error.code === "SIMULATION_IDEMPOTENCY_CONFLICT") {
        throw new ApiException(409, "IDEMPOTENCY_CONFLICT", "同一幂等键对应了不同模拟订单");
      }
      throw new ApiException(400, error.code, error.message);
    }
    throw error;
  }
}
