export interface ChainLogIdentity {
  readonly blockHash: string;
  readonly blockNumber: bigint;
  readonly logIndex: number;
  readonly transactionHash: string;
}

export interface IndexerCliOptions {
  readonly fromBlock?: bigint;
  readonly help: boolean;
  readonly once: boolean;
  readonly resync: boolean;
  readonly toBlock?: bigint;
}

function parseBlockArgument(flag: string, value: string | undefined): bigint {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new Error(`${flag} requires a non-negative integer block number`);
  }

  return BigInt(value);
}

export function parseIndexerArgs(args: readonly string[]): IndexerCliOptions {
  let fromBlock: bigint | undefined;
  let toBlock: bigint | undefined;
  let once = false;
  let resync = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    switch (argument) {
      case "--from-block":
        fromBlock = parseBlockArgument(argument, args[index + 1]);
        index += 1;
        break;
      case "--to-block":
        toBlock = parseBlockArgument(argument, args[index + 1]);
        index += 1;
        break;
      case "--once":
        once = true;
        break;
      case "--resync":
        resync = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        throw new Error(`Unknown indexer argument: ${argument}`);
    }
  }

  if (resync && fromBlock === undefined) {
    throw new Error("--resync requires --from-block");
  }

  if (
    fromBlock !== undefined &&
    toBlock !== undefined &&
    toBlock < fromBlock
  ) {
    throw new Error("--to-block must be greater than or equal to --from-block");
  }

  return { fromBlock, help, once, resync, toBlock };
}

export function sortAndDedupeLogs<T extends ChainLogIdentity>(
  logs: readonly T[],
): T[] {
  const uniqueLogs = new Map<string, T>();

  for (const log of logs) {
    const key = [
      log.blockHash.toLowerCase(),
      log.transactionHash.toLowerCase(),
      log.logIndex.toString(),
    ].join(":");

    if (!uniqueLogs.has(key)) {
      uniqueLogs.set(key, log);
    }
  }

  return [...uniqueLogs.values()].sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber < right.blockNumber ? -1 : 1;
    }

    if (left.logIndex !== right.logIndex) {
      return left.logIndex - right.logIndex;
    }

    return left.transactionHash.localeCompare(right.transactionHash);
  });
}

export function computeYesProbabilityBps(
  yesReserve: bigint,
  noReserve: bigint,
): bigint {
  if (yesReserve < 0n || noReserve < 0n) {
    throw new Error("Reserves cannot be negative");
  }

  const totalReserve = yesReserve + noReserve;
  if (totalReserve === 0n) {
    throw new Error("Cannot derive a probability from empty reserves");
  }

  // In a two-outcome constant-product pool, the YES marginal price is
  // proportional to the opposing (NO) reserve.
  return (noReserve * 10_000n) / totalReserve;
}

export function retryDelayMs(
  attempt: number,
  baseDelayMs: number,
  maximumDelayMs: number,
): number {
  if (
    !Number.isInteger(attempt) ||
    attempt < 1 ||
    !Number.isInteger(baseDelayMs) ||
    baseDelayMs < 1 ||
    !Number.isInteger(maximumDelayMs) ||
    maximumDelayMs < baseDelayMs
  ) {
    throw new Error("Invalid retry delay parameters");
  }

  const exponent = Math.min(attempt - 1, 30);
  return Math.min(maximumDelayMs, baseDelayMs * 2 ** exponent);
}

export function orderTransitionPath(
  state: string,
  target: "FAILED" | "INDEXED",
): readonly string[] | undefined {
  const indexedPaths: Record<string, readonly string[]> = {
    CONFIRMED: ["INDEXED"],
    CONFIRMING: ["CONFIRMED", "INDEXED"],
    ORPHANED: ["CONFIRMING", "CONFIRMED", "INDEXED"],
    REORGED: ["CONFIRMING", "CONFIRMED", "INDEXED"],
    SUBMITTED: ["CONFIRMING", "CONFIRMED", "INDEXED"],
  };
  const failedPaths: Record<string, readonly string[]> = {
    CONFIRMING: ["FAILED"],
    ORPHANED: ["CONFIRMING", "FAILED"],
    REORGED: ["CONFIRMING", "FAILED"],
    SUBMITTED: ["CONFIRMING", "FAILED"],
  };
  return (target === "INDEXED" ? indexedPaths : failedPaths)[state];
}

function unsignedInteger(value: unknown): string {
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value.toString();
  }
  throw new Error("Payout numerator must be a non-negative integer");
}

export function parseBinaryPayoutNumerators(value: unknown): readonly [string, string] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("Binary payout vector must contain exactly two numerators");
  }
  const yes = unsignedInteger(value[0]);
  const no = unsignedInteger(value[1]);
  if (BigInt(yes) + BigInt(no) === 0n) {
    throw new Error("Binary payout denominator must be positive");
  }
  return [yes, no];
}
