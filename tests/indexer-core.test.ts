import { describe, expect, it } from "vitest";

import {
  computeYesProbabilityBps,
  orderTransitionPath,
  parseIndexerArgs,
  parseBinaryPayoutNumerators,
  retryDelayMs,
  sortAndDedupeLogs,
} from "../worker/indexer-core";

describe("indexer CLI", () => {
  it("parses a bounded manual resync", () => {
    expect(
      parseIndexerArgs([
        "--from-block",
        "100",
        "--to-block",
        "200",
        "--resync",
        "--once",
      ]),
    ).toEqual({
      fromBlock: 100n,
      help: false,
      once: true,
      resync: true,
      toBlock: 200n,
    });
  });

  it("rejects an unsafe reversed range", () => {
    expect(() =>
      parseIndexerArgs(["--from-block", "10", "--to-block", "9"]),
    ).toThrow("--to-block must be greater");
  });

  it("requires a rewind point for resync", () => {
    expect(() => parseIndexerArgs(["--resync"])).toThrow(
      "--resync requires --from-block",
    );
  });
});

describe("event identity", () => {
  it("deduplicates a repeated RPC log and preserves chain order", () => {
    const logs = sortAndDedupeLogs([
      {
        blockHash: "0xbbb",
        blockNumber: 11n,
        logIndex: 2,
        transactionHash: "0x222",
      },
      {
        blockHash: "0xaaa",
        blockNumber: 10n,
        logIndex: 1,
        transactionHash: "0x111",
      },
      {
        blockHash: "0xaaa",
        blockNumber: 10n,
        logIndex: 1,
        transactionHash: "0x111",
      },
    ]);

    expect(logs).toHaveLength(2);
    expect(logs.map((log) => log.blockNumber)).toEqual([10n, 11n]);
  });

  it("retains the same transaction/log identity on a different fork", () => {
    const logs = sortAndDedupeLogs([
      {
        blockHash: "0xfork-a",
        blockNumber: 10n,
        logIndex: 1,
        transactionHash: "0xsame",
      },
      {
        blockHash: "0xfork-b",
        blockNumber: 10n,
        logIndex: 1,
        transactionHash: "0xsame",
      },
    ]);

    expect(logs).toHaveLength(2);
  });
});

describe("integer projection helpers", () => {
  it("derives basis points without floating point arithmetic", () => {
    expect(computeYesProbabilityBps(3n, 7n)).toBe(7_000n);
  });

  it("uses bounded exponential retry delays", () => {
    expect(retryDelayMs(1, 500, 2_000)).toBe(500);
    expect(retryDelayMs(4, 500, 2_000)).toBe(2_000);
  });

  it("accepts only a funded binary payout vector", () => {
    expect(parseBinaryPayoutNumerators([1n, 0n])).toEqual(["1", "0"]);
    expect(parseBinaryPayoutNumerators(["1", "1"])).toEqual(["1", "1"]);
    expect(() => parseBinaryPayoutNumerators([0n, 0n])).toThrow("denominator");
    expect(() => parseBinaryPayoutNumerators([1n])).toThrow("exactly two");
  });
});

describe("indexer order progression", () => {
  it("uses only legal intermediate states for a confirmed trade", () => {
    expect(orderTransitionPath("SUBMITTED", "INDEXED")).toEqual([
      "CONFIRMING",
      "CONFIRMED",
      "INDEXED",
    ]);
    expect(orderTransitionPath("ORPHANED", "INDEXED")).toEqual([
      "CONFIRMING",
      "CONFIRMED",
      "INDEXED",
    ]);
  });

  it("does not move terminal or unrelated states", () => {
    expect(orderTransitionPath("FAILED", "INDEXED")).toBeUndefined();
    expect(orderTransitionPath("PREPARED", "FAILED")).toBeUndefined();
  });
});
