import { describe, expect, it } from "vitest";

import {
  expandTransferMovements,
  replayCanonicalBalance,
  resolveBinaryPositionMappings,
  ZERO_EVM_ADDRESS,
  type CanonicalMovement,
} from "../worker/projection-domain";

const alice = "0x1111111111111111111111111111111111111111";
const bob = "0x2222222222222222222222222222222222222222";

function stored(
  movement: ReturnType<typeof expandTransferMovements>[number],
  overrides: Partial<CanonicalMovement> = {},
): CanonicalMovement {
  return {
    ...movement,
    blockHash: "0x" + "a".repeat(64),
    blockNumber: 10n,
    canonical: true,
    chainId: 80002,
    logIndex: 1,
    transactionHash: "0x" + "b".repeat(64),
    ...overrides,
  };
}

describe("token transfer projection", () => {
  it("expands TransferSingle into exact debit and credit legs", () => {
    const movements = expandTransferMovements(alice, bob, [
      { amount: 25n, itemIndex: 0, tokenId: 101n },
    ]);
    expect(movements).toEqual([
      { account: alice, amount: 25n, direction: "DEBIT", itemIndex: 0, tokenId: 101n },
      { account: bob, amount: 25n, direction: "CREDIT", itemIndex: 0, tokenId: 101n },
    ]);
  });

  it("expands every TransferBatch item independently", () => {
    const movements = expandTransferMovements(alice, bob, [
      { amount: 10n, itemIndex: 0, tokenId: 101n },
      { amount: 20n, itemIndex: 1, tokenId: 202n },
    ]);
    expect(movements).toHaveLength(4);
    expect(movements.filter((movement) => movement.itemIndex === 1)).toHaveLength(2);
  });

  it("treats the zero address as mint and burn rather than an account", () => {
    const mint = expandTransferMovements(ZERO_EVM_ADDRESS, alice, [
      { amount: 30n, itemIndex: 0, tokenId: 101n },
    ]);
    const burn = expandTransferMovements(alice, ZERO_EVM_ADDRESS, [
      { amount: 12n, itemIndex: 0, tokenId: 101n },
    ]);
    expect(mint).toEqual([
      { account: alice, amount: 30n, direction: "CREDIT", itemIndex: 0, tokenId: 101n },
    ]);
    expect(burn).toEqual([
      { account: alice, amount: 12n, direction: "DEBIT", itemIndex: 0, tokenId: 101n },
    ]);
  });

  it("deduplicates the same physical event identity", () => {
    const [mint] = expandTransferMovements(ZERO_EVM_ADDRESS, alice, [
      { amount: 30n, itemIndex: 0, tokenId: null },
    ]);
    const row = stored(mint!);
    expect(replayCanonicalBalance([row, row]).balance).toBe(30n);
  });

  it("removes orphaned movement and applies its replacement", () => {
    const [oldMint] = expandTransferMovements(ZERO_EVM_ADDRESS, alice, [
      { amount: 30n, itemIndex: 0, tokenId: 101n },
    ]);
    const [replacementMint] = expandTransferMovements(ZERO_EVM_ADDRESS, alice, [
      { amount: 40n, itemIndex: 0, tokenId: 101n },
    ]);
    const result = replayCanonicalBalance([
      stored(oldMint!, { canonical: false }),
      stored(replacementMint!, {
        blockHash: "0x" + "c".repeat(64),
        transactionHash: "0x" + "d".repeat(64),
      }),
    ]);
    expect(result).toEqual({ balance: 40n, asOfBlock: 10n });
  });

  it("rejects an asset balance history that is not fully backed", () => {
    const [burn] = expandTransferMovements(alice, ZERO_EVM_ADDRESS, [
      { amount: 1n, itemIndex: 0, tokenId: null },
    ]);
    expect(() => replayCanonicalBalance([stored(burn!)])).toThrow(/negative balance/);
  });
});

describe("binary CTF position mapping", () => {
  it("maps collection IDs and token IDs only by matching market getters", () => {
    const mappings = resolveBinaryPositionMappings(
      [
        { collectionId: "0x" + "1".repeat(64), indexSet: 1n, positionId: 700n },
        { collectionId: "0x" + "2".repeat(64), indexSet: 2n, positionId: 800n },
      ],
      800n,
      700n,
    );
    expect(mappings).toEqual([
      {
        collectionId: "0x" + "2".repeat(64),
        indexSet: 2n,
        outcome: "YES",
        positionId: 800n,
        tokenId: 800n,
      },
      {
        collectionId: "0x" + "1".repeat(64),
        indexSet: 1n,
        outcome: "NO",
        positionId: 700n,
        tokenId: 700n,
      },
    ]);
  });

  it("rejects a position ID that cannot be proven by CTF candidates", () => {
    expect(() => resolveBinaryPositionMappings(
      [
        { collectionId: "0x" + "1".repeat(64), indexSet: 1n, positionId: 700n },
        { collectionId: "0x" + "2".repeat(64), indexSet: 2n, positionId: 800n },
      ],
      900n,
      700n,
    )).toThrow(/do not match/);
  });
});
