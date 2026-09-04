import { describe, expect, it } from "vitest";

import {
  getProjectEventDefinition,
  PROJECT_EVENT_DEFINITIONS,
} from "../worker/contract-events";

describe("project contract event registry", () => {
  it("uses the exact BinaryMarket artifact signatures", () => {
    const signatures = PROJECT_EVENT_DEFINITIONS.filter((definition) =>
      definition.kinds.includes("MARKET"),
    ).map((definition) => definition.signature);

    expect(signatures).toEqual([
      "CancellationRoundingPolicy(uint256,string)",
      "Challenged(address,uint256,bytes32)",
      "Finalized(uint8,bool)",
      "LiquidityInitialized(address,uint256,uint256,uint256)",
      "LiquidityRedeemed(address,uint256)",
      "ResolutionProposed(uint8,bytes32,uint256)",
      "Trade(address,uint8,bool,uint256,uint256,uint256,uint256,uint256)",
    ]);
  });

  it("tracks the exact Factory and voucher indexed fields", () => {
    const marketCreated = PROJECT_EVENT_DEFINITIONS.find(
      (definition) => definition.eventName === "MarketCreated",
    );
    const voucherClaimed = PROJECT_EVENT_DEFINITIONS.find(
      (definition) => definition.eventName === "VoucherClaimed",
    );

    expect(marketCreated?.indexedNames).toEqual([
      "market",
      "creator",
      "metadataHash",
    ]);
    expect(voucherClaimed?.indexedNames).toEqual(["claimId", "wallet"]);
  });

  it("accepts an event only for its registered contract kind and topic", () => {
    const trade = PROJECT_EVENT_DEFINITIONS.find(
      (definition) => definition.eventName === "Trade",
    );
    expect(trade).toBeDefined();
    expect(
      getProjectEventDefinition("Trade", "MARKET", trade?.topic0),
    ).toBe(trade);
    expect(() =>
      getProjectEventDefinition("Trade", "FACTORY", trade?.topic0),
    ).toThrow("not registered");
  });

  it("does not invent order lifecycle events absent from Solidity", () => {
    const names = PROJECT_EVENT_DEFINITIONS.map(
      (definition) => definition.eventName,
    );
    expect(names).not.toContain("OrderCreated");
    expect(names).not.toContain("OrderCancelled");
  });
});
