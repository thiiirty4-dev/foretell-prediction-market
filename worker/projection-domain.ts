const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const BYTES32_PATTERN = /^0x[0-9a-f]{64}$/;

export const ZERO_EVM_ADDRESS = "0x0000000000000000000000000000000000000000";

export type MovementDirection = "CREDIT" | "DEBIT";

export interface TransferItem {
  readonly amount: bigint;
  readonly itemIndex: number;
  readonly tokenId: bigint | null;
}

export interface TransferMovement extends TransferItem {
  readonly account: string;
  readonly direction: MovementDirection;
}

export interface CanonicalMovement extends TransferMovement {
  readonly blockHash: string;
  readonly blockNumber: bigint;
  readonly canonical: boolean;
  readonly chainId: number;
  readonly logIndex: number;
  readonly transactionHash: string;
}

export interface BinaryPositionCandidate {
  readonly collectionId: string;
  readonly indexSet: bigint;
  readonly positionId: bigint;
}

export interface BinaryPositionMapping extends BinaryPositionCandidate {
  readonly outcome: "NO" | "YES";
  readonly tokenId: bigint;
}

function normalizedAddress(value: string): string {
  const normalized = value.toLowerCase();
  if (!ADDRESS_PATTERN.test(normalized)) {
    throw new Error(`Invalid EVM address: ${value}`);
  }
  return normalized;
}

function assertTransferItem(item: TransferItem): void {
  if (!Number.isInteger(item.itemIndex) || item.itemIndex < 0) {
    throw new Error("Transfer item index must be a non-negative integer");
  }
  if (item.amount < 0n) {
    throw new Error("Transfer amount cannot be negative");
  }
  if (item.tokenId !== null && item.tokenId < 0n) {
    throw new Error("Token ID cannot be negative");
  }
}

export function expandTransferMovements(
  from: string,
  to: string,
  items: readonly TransferItem[],
): TransferMovement[] {
  const normalizedFrom = normalizedAddress(from);
  const normalizedTo = normalizedAddress(to);
  if (normalizedFrom === ZERO_EVM_ADDRESS && normalizedTo === ZERO_EVM_ADDRESS) {
    throw new Error("A transfer cannot mint from and burn to the zero address");
  }

  const movements: TransferMovement[] = [];
  for (const item of items) {
    assertTransferItem(item);
    if (normalizedFrom !== ZERO_EVM_ADDRESS) {
      movements.push({
        ...item,
        account: normalizedFrom,
        direction: "DEBIT",
      });
    }
    if (normalizedTo !== ZERO_EVM_ADDRESS) {
      movements.push({
        ...item,
        account: normalizedTo,
        direction: "CREDIT",
      });
    }
  }
  return movements;
}

function movementIdentity(movement: CanonicalMovement): string {
  return [
    movement.chainId,
    movement.transactionHash.toLowerCase(),
    movement.logIndex,
    movement.blockHash.toLowerCase(),
    movement.itemIndex,
    movement.direction,
    movement.account.toLowerCase(),
    movement.tokenId?.toString() ?? "asset",
  ].join(":");
}

export function replayCanonicalBalance(
  movements: readonly CanonicalMovement[],
): { balance: bigint; asOfBlock: bigint | null } {
  const unique = new Map<string, CanonicalMovement>();
  for (const movement of movements) {
    if (!movement.canonical) continue;
    assertTransferItem(movement);
    const key = movementIdentity(movement);
    const existing = unique.get(key);
    if (existing && existing.amount !== movement.amount) {
      throw new Error(`Conflicting duplicate movement ${key}`);
    }
    unique.set(key, movement);
  }

  let balance = 0n;
  let asOfBlock: bigint | null = null;
  for (const movement of unique.values()) {
    balance += movement.direction === "CREDIT" ? movement.amount : -movement.amount;
    if (asOfBlock === null || movement.blockNumber > asOfBlock) {
      asOfBlock = movement.blockNumber;
    }
  }
  if (balance < 0n) {
    throw new Error("Canonical transfer history produces a negative balance");
  }
  return { balance, asOfBlock };
}

export function parseUnsignedBigIntArray(
  value: unknown,
  fieldName: string,
): bigint[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  return value.map((entry, index) => {
    if (typeof entry === "bigint" && entry >= 0n) return entry;
    if (typeof entry === "string" && /^(0|[1-9]\d*)$/.test(entry)) {
      return BigInt(entry);
    }
    throw new Error(`${fieldName}[${index}] must be an unsigned integer`);
  });
}

export function resolveBinaryPositionMappings(
  candidates: readonly BinaryPositionCandidate[],
  yesPositionId: bigint,
  noPositionId: bigint,
): readonly [BinaryPositionMapping, BinaryPositionMapping] {
  if (yesPositionId < 0n || noPositionId < 0n || yesPositionId === noPositionId) {
    throw new Error("Binary market position IDs must be distinct uint256 values");
  }
  if (candidates.length !== 2) {
    throw new Error("Binary position mapping requires exactly two index-set candidates");
  }
  for (const candidate of candidates) {
    if (
      candidate.indexSet <= 0n ||
      candidate.positionId < 0n ||
      !BYTES32_PATTERN.test(candidate.collectionId.toLowerCase())
    ) {
      throw new Error("Invalid binary position candidate");
    }
  }

  const yes = candidates.find((candidate) => candidate.positionId === yesPositionId);
  const no = candidates.find((candidate) => candidate.positionId === noPositionId);
  if (!yes || !no || yes === no) {
    throw new Error("CTF candidates do not match the market YES/NO position getters");
  }
  return [
    { ...yes, outcome: "YES", tokenId: yes.positionId },
    { ...no, outcome: "NO", tokenId: no.positionId },
  ];
}
