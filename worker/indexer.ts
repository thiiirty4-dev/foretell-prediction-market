import "dotenv/config";

import pino from "pino";
import {
  Pool,
  type PoolClient,
  type QueryResultRow,
} from "pg";
import {
  createPublicClient,
  decodeEventLog,
  http,
  isAddress,
  parseAbi,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { polygonAmoy } from "viem/chains";
import { z } from "zod";

import {
  computeYesProbabilityBps,
  orderTransitionPath,
  parseIndexerArgs,
  parseBinaryPayoutNumerators,
  retryDelayMs,
  sortAndDedupeLogs,
  type ChainLogIdentity,
} from "./indexer-core";
import {
  getProjectEventDefinition,
  PROJECT_EVENT_ABI,
  type ProjectContractKind,
  type ProjectEventDefinition,
} from "./contract-events";
import {
  expandTransferMovements,
  parseUnsignedBigIntArray,
  replayCanonicalBalance,
  resolveBinaryPositionMappings,
  type CanonicalMovement,
  type MovementDirection,
} from "./projection-domain";

const CHAIN_ID = 80_002;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const PROJECTOR_VERSION = 3;
const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;
const MARKET_POSITION_ABI = parseAbi([
  "function conditionId() view returns (bytes32)",
  "function collateral() view returns (address)",
  "function ctf() view returns (address)",
  "function yesPositionId() view returns (uint256)",
  "function noPositionId() view returns (uint256)",
]);
const CTF_POSITION_ABI = parseAbi([
  "function getCollectionId(bytes32 parentCollectionId,bytes32 conditionId,uint256 indexSet) view returns (bytes32)",
  "function getPositionId(address collateralToken,bytes32 collectionId) pure returns (uint256)",
]);

const integerString = z.string().regex(/^\d+$/);
const environmentSchema = z.object({
  AMOY_RPC_URL: z.string().url(),
  CONTRACT_DEPLOYMENT_BLOCK: integerString.optional(),
  DATABASE_URL: z.string().min(1),
  INDEXER_BATCH_SIZE: integerString.optional(),
  INDEXER_CONFIRMATIONS: integerString.optional(),
  INDEXER_CTF_ADDRESS: z.string().min(1),
  INDEXER_DATABASE_URL: z.string().min(1).optional(),
  INDEXER_FACTORY_ADDRESS: z.string().min(1),
  INDEXER_FUSD_ADDRESS: z.string().min(1),
  INDEXER_LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),
  INDEXER_MARKET_ADDRESSES: z.string().optional(),
  INDEXER_MAX_REORG_DEPTH: integerString.optional(),
  INDEXER_MAX_RETRIES: integerString.optional(),
  INDEXER_POLL_INTERVAL_MS: integerString.optional(),
  INDEXER_RETRY_BASE_MS: integerString.optional(),
  INDEXER_RETRY_MAX_MS: integerString.optional(),
  INDEXER_START_BLOCK: integerString.optional(),
});

type ContractKind = ProjectContractKind;

interface IndexerConfig {
  readonly batchSize: number;
  readonly confirmations: bigint;
  readonly contracts: readonly ContractRegistration[];
  readonly databaseUrl: string;
  readonly logLevel: string;
  readonly maxReorgDepth: bigint;
  readonly maxRetries: number;
  readonly pollIntervalMs: number;
  readonly retryBaseMs: number;
  readonly retryMaxMs: number;
  readonly rpcUrl: string;
  readonly startBlock: bigint;
}

interface ContractRegistration {
  readonly address: Address;
  readonly deploymentBlock: bigint;
  readonly kind: ContractKind;
  readonly source: "ENV";
}

interface RegisteredContract extends QueryResultRow {
  readonly address: string;
  readonly deployment_block: string;
  readonly kind: ContractKind;
}

interface CheckpointRow extends QueryResultRow {
  readonly current_block: string;
  readonly current_hash: string | null;
  readonly parent_hash: string | null;
  readonly start_block: string;
}

interface MarketRow extends QueryResultRow {
  readonly close_time?: Date;
  readonly close_time_epoch?: string;
  readonly contract_address?: string | null;
  readonly id: string;
  readonly mechanism_version?: number;
  readonly metadata_uri?: string;
}

interface ProjectionRow extends QueryResultRow {
  readonly block_number: string;
  readonly market_id: string;
  readonly projection_type: string;
  readonly status_after: StandardizedProjection["statusAfter"] | null;
}

interface ProbabilityRow extends QueryResultRow {
  readonly block_number: string;
  readonly yes_probability_bps: number;
}

interface AggregateRow extends QueryResultRow {
  readonly confirmed_block: string | null;
  readonly volume: string;
}

interface SettlementRow extends QueryResultRow {
  readonly details: Record<string, unknown>;
}

interface BlockRow extends QueryResultRow {
  readonly hash: string;
  readonly number: string;
  readonly parent_hash: string;
}

interface OrderRow extends QueryResultRow {
  readonly amount: string;
  readonly id: string;
  readonly market_id: string;
  readonly operation: "BUY" | "SELL";
  readonly side: "NO" | "YES";
  readonly state: string;
  readonly transaction_hash: string | null;
  readonly wallet_address: string;
}

interface CurrentEventRow extends QueryResultRow {
  readonly block_hash: string;
  readonly block_number: string;
  readonly contract_address: string;
  readonly event_args: Record<string, unknown>;
  readonly event_name: string;
  readonly log_index: number;
  readonly transaction_hash: string;
}

interface PositionMappingRow extends QueryResultRow {
  readonly ctf_address: string;
  readonly market_id: string;
  readonly outcome: "NO" | "YES";
  readonly position_id: string;
}

interface MovementRow extends QueryResultRow {
  readonly account: string;
  readonly amount: string;
  readonly block_hash: string;
  readonly block_number: string;
  readonly canonical: boolean;
  readonly chain_id: number;
  readonly direction: MovementDirection;
  readonly item_index: number;
  readonly log_index: number;
  readonly position_id: string | null;
  readonly transaction_hash: string;
}

interface AffectedPositionRow extends PositionMappingRow {
  readonly account: string;
}

interface AffectedAssetRow extends QueryResultRow {
  readonly account: string;
  readonly token_address: string;
}

interface Checkpoint {
  readonly currentBlock: bigint;
  readonly currentHash: Hex | null;
  readonly parentHash: Hex | null;
  readonly startBlock: bigint;
}

interface BlockHeader {
  readonly hash: Hex;
  readonly number: bigint;
  readonly parentHash: Hex;
  readonly timestamp: Date;
}

interface CompleteLog extends ChainLogIdentity {
  readonly address: Address;
  readonly data: Hex;
  readonly topics: readonly Hex[];
  readonly transactionIndex: number;
}

interface DecodedChainEvent {
  readonly args: Record<string, unknown>;
  readonly definition: ProjectEventDefinition;
  readonly eventName: string;
  readonly indexedArgs: Record<string, unknown>;
  readonly log: CompleteLog;
}

interface StandardizedProjection {
  readonly action?: "BUY" | "SELL";
  readonly actorAddress?: string;
  readonly cancelled?: boolean;
  readonly collateralAmount?: string;
  readonly details?: Record<string, unknown>;
  readonly feeAmount?: string;
  readonly marketId?: string;
  readonly noReserve?: string;
  readonly outcome?: number;
  readonly projectionType:
    | "ASSET_ACTIVITY"
    | "CONDITION_PREPARED"
    | "LIQUIDITY_CHANGED"
    | "MARKET_CREATED"
    | "MARKET_STATUS_CHANGED"
    | "ORDER_FILLED"
    | "POSITION_CHANGED"
    | "PROBABILITY_CHANGED"
    | "REDEMPTION"
    | "SETTLEMENT";
  readonly shareAmount?: string;
  readonly side?: "NO" | "YES";
  readonly statusAfter?:
    | "CANCELLED"
    | "CLOSED"
    | "DISPUTED"
    | "OPEN"
    | "PROPOSED"
    | "RESOLVED";
  readonly yesReserve?: string;
}

interface BatchMetrics {
  failedEvents: number;
  processedEvents: number;
  retryCount: number;
}

interface BatchResult {
  readonly currentBlock: bigint;
  readonly didProcess: boolean;
  readonly latestBlock: bigint;
  readonly reorged: boolean;
}

class FatalIndexerError extends Error {
  override readonly name: string = "FatalIndexerError";
}

class UnknownProjectEventError extends FatalIndexerError {
  override readonly name = "UnknownProjectEventError";
}

function requiredAddress(name: string, value: string): Address {
  if (!isAddress(value) || value.toLowerCase() === ZERO_ADDRESS) {
    throw new FatalIndexerError(
      `${name} must be a non-zero EVM address supplied through the environment`,
    );
  }

  return value.toLowerCase() as Address;
}

function boundedInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value === undefined ? fallback : Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new FatalIndexerError(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }

  return parsed;
}

function loadConfig(environment: NodeJS.ProcessEnv): IndexerConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join("."));
    throw new FatalIndexerError(
      `Invalid indexer environment configuration: ${fields.join(", ")}`,
    );
  }

  const env = parsed.data;
  const startBlock = BigInt(
    env.INDEXER_START_BLOCK ?? env.CONTRACT_DEPLOYMENT_BLOCK ?? "0",
  );
  const marketAddresses = (env.INDEXER_MARKET_ADDRESSES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value, index) =>
      requiredAddress(`INDEXER_MARKET_ADDRESSES[${index}]`, value),
    );

  const contracts: ContractRegistration[] = [
    {
      address: requiredAddress(
        "INDEXER_FACTORY_ADDRESS",
        env.INDEXER_FACTORY_ADDRESS,
      ),
      deploymentBlock: startBlock,
      kind: "FACTORY",
      source: "ENV",
    },
    {
      address: requiredAddress("INDEXER_FUSD_ADDRESS", env.INDEXER_FUSD_ADDRESS),
      deploymentBlock: startBlock,
      kind: "FUSD",
      source: "ENV",
    },
    {
      address: requiredAddress("INDEXER_CTF_ADDRESS", env.INDEXER_CTF_ADDRESS),
      deploymentBlock: startBlock,
      kind: "CTF",
      source: "ENV",
    },
    ...marketAddresses.map(
      (address): ContractRegistration => ({
        address,
        deploymentBlock: startBlock,
        kind: "MARKET",
        source: "ENV",
      }),
    ),
  ];

  const uniqueContracts = new Map<string, ContractRegistration>();
  for (const contract of contracts) {
    const existing = uniqueContracts.get(contract.address);
    if (existing && existing.kind !== contract.kind) {
      throw new FatalIndexerError(
        `Contract ${contract.address} is configured with multiple kinds`,
      );
    }
    uniqueContracts.set(contract.address, contract);
  }

  return {
    batchSize: boundedInteger(
      "INDEXER_BATCH_SIZE",
      env.INDEXER_BATCH_SIZE,
      500,
      1,
      2_000,
    ),
    confirmations: BigInt(env.INDEXER_CONFIRMATIONS ?? "12"),
    contracts: [...uniqueContracts.values()],
    databaseUrl: env.INDEXER_DATABASE_URL ?? env.DATABASE_URL,
    logLevel: env.INDEXER_LOG_LEVEL ?? "info",
    maxReorgDepth: BigInt(env.INDEXER_MAX_REORG_DEPTH ?? "256"),
    maxRetries: boundedInteger(
      "INDEXER_MAX_RETRIES",
      env.INDEXER_MAX_RETRIES,
      5,
      1,
      20,
    ),
    pollIntervalMs: boundedInteger(
      "INDEXER_POLL_INTERVAL_MS",
      env.INDEXER_POLL_INTERVAL_MS,
      5_000,
      250,
      300_000,
    ),
    retryBaseMs: boundedInteger(
      "INDEXER_RETRY_BASE_MS",
      env.INDEXER_RETRY_BASE_MS,
      500,
      50,
      60_000,
    ),
    retryMaxMs: boundedInteger(
      "INDEXER_RETRY_MAX_MS",
      env.INDEXER_RETRY_MAX_MS,
      15_000,
      100,
      300_000,
    ),
    rpcUrl: env.AMOY_RPC_URL,
    startBlock,
  };
}

function safeError(error: unknown): { message: string; name: string } {
  if (!(error instanceof Error)) {
    return { message: "Unknown error", name: "UnknownError" };
  }

  return {
    message: error.message.replace(/https?:\/\/\S+/giu, "[redacted-url]"),
    name: error.name,
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeHash(value: string): Hex {
  return value.toLowerCase() as Hex;
}

function jsonCompatible(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(jsonCompatible);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        jsonCompatible(item),
      ]),
    );
  }

  return value;
}

function asDecimal(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value.toString();
  }

  throw new FatalIndexerError(`Decoded event is missing integer field ${name}`);
}

function asAddress(args: Record<string, unknown>, name: string): Address {
  const value = args[name];
  if (typeof value !== "string" || !isAddress(value)) {
    throw new FatalIndexerError(`Decoded event is missing address field ${name}`);
  }
  return value.toLowerCase() as Address;
}

function asBoolean(args: Record<string, unknown>, name: string): boolean {
  const value = args[name];
  if (typeof value !== "boolean") {
    throw new FatalIndexerError(`Decoded event is missing boolean field ${name}`);
  }
  return value;
}

function asHex(args: Record<string, unknown>, name: string): Hex {
  const value = args[name];
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
    throw new FatalIndexerError(`Decoded event is missing hex field ${name}`);
  }
  return normalizeHash(value);
}

function asString(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string") {
    throw new FatalIndexerError(`Decoded event is missing string field ${name}`);
  }
  return value;
}

function asSmallInteger(args: Record<string, unknown>, name: string): number {
  const value = BigInt(asDecimal(args, name));
  if (value > 255n) {
    throw new FatalIndexerError(`Decoded event field ${name} exceeds uint8`);
  }
  return Number(value);
}

function assertCompleteLog(log: Log): CompleteLog {
  if (
    log.blockHash === null ||
    log.blockNumber === null ||
    log.logIndex === null ||
    log.transactionHash === null
  ) {
    throw new FatalIndexerError("RPC returned a pending log for a confirmed range");
  }

  return {
    address: log.address.toLowerCase() as Address,
    blockHash: normalizeHash(log.blockHash),
    blockNumber: log.blockNumber,
    data: log.data,
    logIndex: log.logIndex,
    topics: log.topics,
    transactionHash: normalizeHash(log.transactionHash),
    transactionIndex: log.transactionIndex ?? 0,
  };
}

function decodeProjectLog(
  log: CompleteLog,
  kind: ContractKind,
): DecodedChainEvent {
  try {
    const decoded = decodeEventLog({
      abi: PROJECT_EVENT_ABI,
      data: log.data,
      strict: true,
      topics: log.topics as [Hex, ...Hex[]],
    });
    const args =
      decoded.args !== undefined &&
      decoded.args !== null &&
      typeof decoded.args === "object"
        ? (decoded.args as Record<string, unknown>)
        : {};
    const definition = getProjectEventDefinition(
      decoded.eventName,
      kind,
      log.topics[0],
    );
    const indexedArgs = Object.fromEntries(
      definition.indexedNames.map((name) => [name, jsonCompatible(args[name])]),
    );

    return {
      args,
      definition,
      eventName: decoded.eventName,
      indexedArgs,
      log,
    };
  } catch (error) {
    throw new UnknownProjectEventError(
      `Unable to decode registered-contract event at ${log.transactionHash}:${log.logIndex}; topic=${log.topics[0] ?? "none"}; ${safeError(error).message}`,
    );
  }
}

async function inTransaction<T>(
  client: PoolClient,
  operation: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function readCheckpoint(
  client: PoolClient,
): Promise<Checkpoint | null> {
  const result = await client.query<CheckpointRow>(
    `SELECT current_block, current_hash, parent_hash, start_block
       FROM indexer_runtime_checkpoints
      WHERE chain_id = $1`,
    [CHAIN_ID],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    currentBlock: BigInt(row.current_block),
    currentHash: row.current_hash ? normalizeHash(row.current_hash) : null,
    parentHash: row.parent_hash ? normalizeHash(row.parent_hash) : null,
    startBlock: BigInt(row.start_block),
  };
}

async function writeCheckpoint(
  client: PoolClient,
  checkpoint: Checkpoint,
): Promise<void> {
  await client.query(
    `INSERT INTO indexer_runtime_checkpoints (
       chain_id, current_block, current_hash, parent_hash, start_block, updated_at
     ) VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (chain_id) DO UPDATE SET
       current_block = EXCLUDED.current_block,
       current_hash = EXCLUDED.current_hash,
       parent_hash = EXCLUDED.parent_hash,
       start_block = EXCLUDED.start_block,
       updated_at = now()`,
    [
      CHAIN_ID,
      checkpoint.currentBlock.toString(),
      checkpoint.currentHash,
      checkpoint.parentHash,
      checkpoint.startBlock.toString(),
    ],
  );
}

async function bootstrapContracts(
  client: PoolClient,
  config: IndexerConfig,
): Promise<void> {
  await inTransaction(client, async () => {
    for (const contract of config.contracts) {
      await client.query(
        `INSERT INTO indexer_contract_registry (
           chain_id, address, kind, abi_version, deployment_block, active, source
         ) VALUES ($1, $2, $3, $4, $5, true, $6)
         ON CONFLICT (chain_id, address) DO UPDATE SET
           kind = EXCLUDED.kind,
           abi_version = EXCLUDED.abi_version,
           deployment_block = LEAST(
             indexer_contract_registry.deployment_block,
             EXCLUDED.deployment_block
           ),
           active = true,
           source = EXCLUDED.source`,
        [
          CHAIN_ID,
          contract.address,
          contract.kind,
          PROJECTOR_VERSION,
          contract.deploymentBlock.toString(),
          contract.source,
        ],
      );
    }
  });
}

async function loadRegisteredContracts(
  client: PoolClient,
  toBlock: bigint,
): Promise<Map<string, RegisteredContract>> {
  const result = await client.query<RegisteredContract>(
    `SELECT address, kind, deployment_block
       FROM indexer_contract_registry
      WHERE chain_id = $1
        AND active = true
        AND deployment_block <= $2
      ORDER BY address`,
    [CHAIN_ID, toBlock.toString()],
  );

  return new Map(
    result.rows.map((row) => [row.address.toLowerCase(), row]),
  );
}

async function fetchHeader(
  rpc: ReturnType<typeof createPublicClient>,
  blockNumber: bigint,
): Promise<BlockHeader> {
  const block = await rpc.getBlock({
    blockNumber,
    includeTransactions: false,
  });
  if (block.hash === null) {
    throw new Error(`RPC returned a block without a hash at ${blockNumber}`);
  }

  return {
    hash: normalizeHash(block.hash),
    number: block.number,
    parentHash: normalizeHash(block.parentHash),
    timestamp: new Date(Number(block.timestamp) * 1_000),
  };
}

async function fetchHeaders(
  rpc: ReturnType<typeof createPublicClient>,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<BlockHeader[]> {
  const count = Number(toBlock - fromBlock + 1n);
  return Promise.all(
    Array.from({ length: count }, (_, index) =>
      fetchHeader(rpc, fromBlock + BigInt(index)),
    ),
  );
}

function validateHeaderChain(
  headers: readonly BlockHeader[],
  checkpoint: Checkpoint | null,
): void {
  const first = headers[0];
  if (!first) {
    throw new FatalIndexerError("Cannot process an empty block range");
  }

  if (
    checkpoint?.currentHash &&
    first.number === checkpoint.currentBlock + 1n &&
    first.parentHash !== checkpoint.currentHash
  ) {
    throw new Error("Checkpoint parent hash no longer matches the canonical chain");
  }

  for (let index = 1; index < headers.length; index += 1) {
    const previous = headers[index - 1];
    const current = headers[index];
    if (!previous || !current || current.parentHash !== previous.hash) {
      throw new Error(`Non-contiguous RPC block range at ${current?.number}`);
    }
  }
}

async function fetchDecodedEvents(
  rpc: ReturnType<typeof createPublicClient>,
  registry: Map<string, RegisteredContract>,
  factoryAddress: Address,
  fromBlock: bigint,
  toBlock: bigint,
  metrics: BatchMetrics,
): Promise<DecodedChainEvent[]> {
  const registeredAddresses = [...registry.keys()] as Address[];
  const baseLogs = (
    await rpc.getLogs({
      address: registeredAddresses,
      fromBlock,
      toBlock,
    })
  ).map(assertCompleteLog);

  const discoveredMarkets = new Set<Address>();
  for (const log of baseLogs) {
    if (log.address !== factoryAddress) {
      continue;
    }

    try {
      const decoded = decodeProjectLog(log, "FACTORY");
      if (decoded.eventName === "MarketCreated") {
        discoveredMarkets.add(asAddress(decoded.args, "market"));
      }
    } catch (error) {
      metrics.failedEvents += 1;
      throw error;
    }
  }

  const newMarkets = [...discoveredMarkets].filter(
    (address) => !registry.has(address),
  );
  const childLogs =
    newMarkets.length === 0
      ? []
      : (
          await rpc.getLogs({
            address: newMarkets,
            fromBlock,
            toBlock,
          })
        ).map(assertCompleteLog);

  for (const address of newMarkets) {
    registry.set(address, {
      address,
      deployment_block: fromBlock.toString(),
      kind: "MARKET",
    });
  }

  const logs = sortAndDedupeLogs([...baseLogs, ...childLogs]);
  return logs.map((log) => {
    try {
      const contract = registry.get(log.address);
      if (!contract) {
        throw new UnknownProjectEventError(
          `Log address ${log.address} is not in the contract registry`,
        );
      }
      return decodeProjectLog(log, contract.kind);
    } catch (error) {
      metrics.failedEvents += 1;
      throw error;
    }
  });
}

async function storeBlock(
  client: PoolClient,
  block: BlockHeader,
): Promise<void> {
  await client.query(
    `UPDATE indexed_blocks
        SET canonical = false,
            orphaned_at = COALESCE(orphaned_at, now())
      WHERE chain_id = $1
        AND number = $2
        AND hash <> $3
        AND canonical = true`,
    [CHAIN_ID, block.number.toString(), block.hash],
  );
  await client.query(
    `INSERT INTO indexed_blocks (
       chain_id, number, hash, parent_hash, canonical, block_timestamp
     ) VALUES ($1, $2, $3, $4, true, $5)
     ON CONFLICT (chain_id, number, hash) DO UPDATE SET
       parent_hash = EXCLUDED.parent_hash,
       canonical = true,
       orphaned_at = NULL,
       block_timestamp = EXCLUDED.block_timestamp`,
    [
      CHAIN_ID,
      block.number.toString(),
      block.hash,
      block.parentHash,
      block.timestamp.toISOString(),
    ],
  );
}

async function storeEvent(
  client: PoolClient,
  event: DecodedChainEvent,
  header: BlockHeader,
): Promise<void> {
  const jsonArgs = JSON.stringify(jsonCompatible(event.args));
  const indexedArgs = JSON.stringify(event.indexedArgs);
  await client.query(
    `INSERT INTO chain_event_inclusions (
       chain_id, transaction_hash, log_index, block_number, block_hash,
       parent_hash, block_timestamp, contract_address, event_name, event_args,
       event_signature, topic0, indexed_args, topics, raw_data
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
       $11, $12, $13::jsonb, $14::jsonb, $15
     )
     ON CONFLICT (chain_id, transaction_hash, log_index, block_hash) DO NOTHING`,
    [
      CHAIN_ID,
      event.log.transactionHash,
      event.log.logIndex,
      event.log.blockNumber.toString(),
      event.log.blockHash,
      header.parentHash,
      header.timestamp.toISOString(),
      event.log.address,
      event.eventName,
      jsonArgs,
      event.definition.signature,
      event.log.topics[0] ?? null,
      indexedArgs,
      JSON.stringify(event.log.topics),
      event.log.data,
    ],
  );
  await client.query(
    `INSERT INTO chain_event_canonicality (
       chain_id, transaction_hash, log_index, block_hash, canonical, reason
     )
     SELECT $1, $2, $3, $4, true, 'observed_confirmed'
      WHERE COALESCE((
        SELECT canonical
          FROM chain_event_canonicality
         WHERE chain_id = $1
           AND transaction_hash = $2
           AND log_index = $3
           AND block_hash = $4
         ORDER BY observed_at DESC, id DESC
         LIMIT 1
      ), false) = false`,
    [
      CHAIN_ID,
      event.log.transactionHash,
      event.log.logIndex,
      event.log.blockHash,
    ],
  );
}

async function registerCreatedMarkets(
  client: PoolClient,
  rpc: ReturnType<typeof createPublicClient>,
  events: readonly DecodedChainEvent[],
  factoryAddress: Address,
  ctfAddress: Address,
  fUsdAddress: Address,
): Promise<void> {
  for (const event of events) {
    if (
      event.log.address !== factoryAddress ||
      event.eventName !== "MarketCreated"
    ) {
      continue;
    }

    const marketAddress = asAddress(event.args, "market");
    const metadataHash = asHex(event.args, "metadataHash");
    const metadataUri = asString(event.args, "metadataURI");
    const closeTime = asDecimal(event.args, "closeTime");
    const mechanismVersion = asDecimal(event.args, "mechanismVersion");
    const marketResult = await client.query<MarketRow>(
      `SELECT id, mechanism_version, metadata_uri,
              extract(epoch FROM close_time)::bigint::text AS close_time_epoch
         FROM markets
        WHERE chain_id = $1
          AND data_origin = 'CHAIN'
          AND (
            lower(metadata_hash) = $2
            OR lower(contract_address) = $3
          )
        ORDER BY created_at
        LIMIT 2`,
      [CHAIN_ID, metadataHash, marketAddress],
    );

    if (marketResult.rows.length !== 1) {
      throw new FatalIndexerError(
        `MarketCreated ${marketAddress} must match exactly one reviewed database market`,
      );
    }
    const market = marketResult.rows[0];
    if (
      market?.metadata_uri !== metadataUri ||
      market.close_time_epoch !== closeTime ||
      market.mechanism_version?.toString() !== mechanismVersion
    ) {
      throw new FatalIndexerError(
        `MarketCreated ${marketAddress} does not match reviewed immutable metadata`,
      );
    }

    await client.query(
      `UPDATE markets
          SET contract_address = $2,
              confirmed_block = $3,
              canonical = true
        WHERE id = $1`,
      [market.id, marketAddress, event.log.blockNumber.toString()],
    );
    await client.query(
      `INSERT INTO indexer_contract_registry (
         chain_id, address, kind, abi_version, deployment_block, active, source
       ) VALUES ($1, $2, 'MARKET', $3, $4, true, 'FACTORY_EVENT')
       ON CONFLICT (chain_id, address) DO UPDATE SET
         kind = 'MARKET',
         abi_version = EXCLUDED.abi_version,
         deployment_block = LEAST(
           indexer_contract_registry.deployment_block,
           EXCLUDED.deployment_block
         ),
         active = true,
         source = 'FACTORY_EVENT'`,
      [
        CHAIN_ID,
        marketAddress,
        PROJECTOR_VERSION,
        event.log.blockNumber.toString(),
      ],
    );
    await registerMarketPositionMappings(
      client,
      rpc,
      event,
      market.id,
      marketAddress,
      ctfAddress,
      fUsdAddress,
    );
  }
}

async function registerMarketPositionMappings(
  client: PoolClient,
  rpc: ReturnType<typeof createPublicClient>,
  event: DecodedChainEvent,
  marketId: string,
  marketAddress: Address,
  expectedCtfAddress: Address,
  expectedFUsdAddress: Address,
): Promise<void> {
  const blockNumber = event.log.blockNumber;
  const conditionId = await rpc.readContract({
    abi: MARKET_POSITION_ABI,
    address: marketAddress,
    blockNumber,
    functionName: "conditionId",
  });
  const marketCtfAddress = (await rpc.readContract({
    abi: MARKET_POSITION_ABI,
    address: marketAddress,
    blockNumber,
    functionName: "ctf",
  })).toLowerCase() as Address;
  const collateralAddress = (await rpc.readContract({
    abi: MARKET_POSITION_ABI,
    address: marketAddress,
    blockNumber,
    functionName: "collateral",
  })).toLowerCase() as Address;
  const yesPositionId = await rpc.readContract({
    abi: MARKET_POSITION_ABI,
    address: marketAddress,
    blockNumber,
    functionName: "yesPositionId",
  });
  const noPositionId = await rpc.readContract({
    abi: MARKET_POSITION_ABI,
    address: marketAddress,
    blockNumber,
    functionName: "noPositionId",
  });

  if (marketCtfAddress !== expectedCtfAddress || collateralAddress !== expectedFUsdAddress) {
    throw new FatalIndexerError(
      `Market ${marketAddress} does not use the configured CTF and fUSD contracts`,
    );
  }

  const candidates = [];
  for (const indexSet of [1n, 2n] as const) {
    const collectionId = await rpc.readContract({
      abi: CTF_POSITION_ABI,
      address: expectedCtfAddress,
      blockNumber,
      functionName: "getCollectionId",
      args: [ZERO_BYTES32, conditionId, indexSet],
    });
    const positionId = await rpc.readContract({
      abi: CTF_POSITION_ABI,
      address: expectedCtfAddress,
      blockNumber,
      functionName: "getPositionId",
      args: [expectedFUsdAddress, collectionId],
    });
    candidates.push({ collectionId, indexSet, positionId });
  }
  const mappings = resolveBinaryPositionMappings(
    candidates,
    yesPositionId,
    noPositionId,
  );

  const marketUpdate = await client.query(
    `UPDATE markets
        SET condition_id = $2,
            confirmed_block = GREATEST(COALESCE(confirmed_block, 0), $3::bigint)
      WHERE id = $1
        AND data_origin = 'CHAIN'
        AND (condition_id IS NULL OR lower(condition_id) = $2)`,
    [marketId, conditionId.toLowerCase(), blockNumber.toString()],
  );
  if (marketUpdate.rowCount !== 1) {
    throw new FatalIndexerError(`Market ${marketAddress} has a conflicting condition ID`);
  }

  await client.query(
    `INSERT INTO market_outcomes (market_id, side)
     VALUES ($1, 'YES'), ($1, 'NO')
     ON CONFLICT (market_id, side) DO NOTHING`,
    [marketId],
  );

  for (const mapping of mappings) {
    await client.query(
      `INSERT INTO ctf_position_mappings (
         chain_id, ctf_address, market_id, market_address, condition_id,
         outcome, index_set, collection_id, position_id,
         source_transaction_hash, source_log_index, source_block_number,
         source_block_hash, canonical, orphaned_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, true, NULL, now()
       )
       ON CONFLICT (market_id, outcome) DO UPDATE SET
         ctf_address = EXCLUDED.ctf_address,
         market_address = EXCLUDED.market_address,
         condition_id = EXCLUDED.condition_id,
         index_set = EXCLUDED.index_set,
         collection_id = EXCLUDED.collection_id,
         position_id = EXCLUDED.position_id,
         source_transaction_hash = EXCLUDED.source_transaction_hash,
         source_log_index = EXCLUDED.source_log_index,
         source_block_number = EXCLUDED.source_block_number,
         source_block_hash = EXCLUDED.source_block_hash,
         canonical = true,
         orphaned_at = NULL,
         updated_at = now()`,
      [
        CHAIN_ID,
        expectedCtfAddress,
        marketId,
        marketAddress,
        conditionId.toLowerCase(),
        mapping.outcome,
        mapping.indexSet.toString(),
        mapping.collectionId.toLowerCase(),
        mapping.positionId.toString(),
        event.log.transactionHash,
        event.log.logIndex,
        blockNumber.toString(),
        event.log.blockHash,
      ],
    );
    const outcomeUpdate = await client.query(
      `UPDATE market_outcomes
          SET position_id = $3
        WHERE market_id = $1
          AND side = $2`,
      [marketId, mapping.outcome, mapping.positionId.toString()],
    );
    if (outcomeUpdate.rowCount !== 1) {
      throw new FatalIndexerError(
        `Market ${marketAddress} does not have exactly one ${mapping.outcome} outcome`,
      );
    }
  }
}

async function marketIdForAddress(
  client: PoolClient,
  address: Address,
): Promise<string> {
  const result = await client.query<MarketRow>(
    `SELECT id FROM markets WHERE lower(contract_address) = $1 LIMIT 2`,
    [address],
  );
  if (result.rows.length !== 1) {
    throw new FatalIndexerError(
      `Registered market ${address} does not map to exactly one database market`,
    );
  }
  return result.rows[0]?.id ?? "";
}

async function optionalMarketIdForAddress(
  client: PoolClient,
  address: Address,
): Promise<string | undefined> {
  const result = await client.query<MarketRow>(
    `SELECT id
       FROM markets
      WHERE chain_id = $1
        AND lower(contract_address) = $2
      LIMIT 1`,
    [CHAIN_ID, address],
  );
  return result.rows[0]?.id;
}

async function optionalMarketIdForCondition(
  client: PoolClient,
  conditionId: Hex,
): Promise<string | undefined> {
  const result = await client.query<MarketRow>(
    `SELECT id
       FROM markets
      WHERE chain_id = $1
        AND lower(condition_id) = $2
      LIMIT 1`,
    [CHAIN_ID, conditionId],
  );
  return result.rows[0]?.id;
}

function toCanonicalMovement(row: MovementRow): CanonicalMovement {
  return {
    account: row.account,
    amount: BigInt(row.amount),
    blockHash: row.block_hash,
    blockNumber: BigInt(row.block_number),
    canonical: row.canonical,
    chainId: row.chain_id,
    direction: row.direction,
    itemIndex: row.item_index,
    logIndex: row.log_index,
    tokenId: row.position_id === null ? null : BigInt(row.position_id),
    transactionHash: row.transaction_hash,
  };
}

async function rebuildPositionSummary(
  client: PoolClient,
  marketId: string,
  account: string,
  fallbackBlock: bigint,
): Promise<void> {
  const result = await client.query<PositionMappingRow & { balance: string }>(
    `SELECT mapping.market_id, mapping.ctf_address, mapping.outcome,
            mapping.position_id::text,
            COALESCE(balance.balance, 0)::text AS balance
       FROM ctf_position_mappings mapping
       LEFT JOIN ctf_position_balances balance
         ON balance.chain_id = mapping.chain_id
        AND balance.ctf_address = mapping.ctf_address
        AND balance.position_id = mapping.position_id
        AND balance.account = $2
      WHERE mapping.market_id = $1
        AND mapping.canonical = true
      ORDER BY mapping.outcome`,
    [marketId, account],
  );
  if (result.rows.length === 0) {
    await client.query(
      `UPDATE positions
          SET yes_quantity = 0,
              no_quantity = 0,
              as_of_block = $3,
              updated_at = now()
        WHERE market_id = $1
          AND wallet_address = $2`,
      [marketId, account, fallbackBlock.toString()],
    );
    return;
  }
  if (result.rows.length !== 2) {
    throw new FatalIndexerError(`Market ${marketId} lacks a complete binary position mapping`);
  }
  const yes = result.rows.find((row) => row.outcome === "YES")?.balance;
  const no = result.rows.find((row) => row.outcome === "NO")?.balance;
  if (yes === undefined || no === undefined) {
    throw new FatalIndexerError(`Market ${marketId} has invalid outcome mappings`);
  }
  await client.query(
    `INSERT INTO positions (
       market_id, wallet_address, yes_quantity, no_quantity,
       cost_basis, realized_pnl, as_of_block, updated_at
     ) VALUES ($1, $2, $3, $4, 0, 0, $5, now())
     ON CONFLICT (market_id, wallet_address) DO UPDATE SET
       yes_quantity = EXCLUDED.yes_quantity,
       no_quantity = EXCLUDED.no_quantity,
       as_of_block = EXCLUDED.as_of_block,
       updated_at = now()`,
    [marketId, account, yes, no, fallbackBlock.toString()],
  );
}

async function rebuildCtfPositionBalance(
  client: PoolClient,
  mapping: PositionMappingRow,
  account: string,
  fallbackBlock: bigint,
  confirmedAt: Date,
): Promise<void> {
  const movementResult = await client.query<MovementRow>(
    `SELECT chain_id, transaction_hash, log_index, block_hash,
            block_number::text, item_index, account, direction,
            amount::text, position_id::text, canonical
       FROM ctf_position_movements
      WHERE chain_id = $1
        AND ctf_address = $2
        AND account = $3
        AND position_id = $4
      ORDER BY block_number, log_index, item_index, direction`,
    [CHAIN_ID, mapping.ctf_address, account, mapping.position_id],
  );
  const replay = replayCanonicalBalance(
    movementResult.rows.map(toCanonicalMovement),
  );
  await client.query(
    `INSERT INTO ctf_position_balances (
       chain_id, ctf_address, market_id, outcome, position_id,
       account, balance, as_of_block, confirmed_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (chain_id, ctf_address, account, position_id) DO UPDATE SET
       market_id = EXCLUDED.market_id,
       outcome = EXCLUDED.outcome,
       balance = EXCLUDED.balance,
       as_of_block = EXCLUDED.as_of_block,
       confirmed_at = EXCLUDED.confirmed_at,
       updated_at = now()`,
    [
      CHAIN_ID,
      mapping.ctf_address,
      mapping.market_id,
      mapping.outcome,
      mapping.position_id,
      account,
      replay.balance.toString(),
      (replay.asOfBlock ?? fallbackBlock).toString(),
      confirmedAt.toISOString(),
    ],
  );
}

async function projectCtfTransfer(
  client: PoolClient,
  event: DecodedChainEvent,
  header: BlockHeader,
): Promise<void> {
  const ids = event.eventName === "TransferSingle"
    ? [BigInt(asDecimal(event.args, "id"))]
    : parseUnsignedBigIntArray(event.args.ids, "ids");
  const values = event.eventName === "TransferSingle"
    ? [BigInt(asDecimal(event.args, "value"))]
    : parseUnsignedBigIntArray(event.args.values, "values");
  if (ids.length !== values.length) {
    throw new FatalIndexerError("TransferBatch ids and values lengths differ");
  }
  const items = ids.map((tokenId, itemIndex) => ({
    amount: values[itemIndex]!,
    itemIndex,
    tokenId,
  }));
  const movements = expandTransferMovements(
    asAddress(event.args, "from"),
    asAddress(event.args, "to"),
    items,
  );
  const uniquePositionIds = [...new Set(ids.map((id) => id.toString()))];
  if (uniquePositionIds.length === 0) return;
  const mappingResult = await client.query<PositionMappingRow>(
    `SELECT ctf_address, market_id, outcome, position_id::text
       FROM ctf_position_mappings
      WHERE chain_id = $1
        AND ctf_address = $2
        AND canonical = true
        AND position_id = ANY($3::numeric[])`,
    [CHAIN_ID, event.log.address, uniquePositionIds],
  );
  const mappings = new Map(
    mappingResult.rows.map((row) => [row.position_id, row]),
  );
  const affected = new Map<string, { account: string; mapping: PositionMappingRow }>();

  for (const movement of movements) {
    const positionId = movement.tokenId?.toString();
    const mapping = positionId ? mappings.get(positionId) : undefined;
    if (!mapping) continue;
    await client.query(
      `INSERT INTO ctf_position_movements (
         chain_id, transaction_hash, log_index, block_hash, block_number,
         ctf_address, market_id, outcome, position_id, item_index,
         account, direction, amount, event_name, canonical, orphaned_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, true, NULL
       )
       ON CONFLICT (
         chain_id, transaction_hash, log_index, block_hash,
         item_index, account, direction
       ) DO UPDATE SET
         canonical = true,
         orphaned_at = NULL`,
      [
        CHAIN_ID,
        event.log.transactionHash,
        event.log.logIndex,
        event.log.blockHash,
        event.log.blockNumber.toString(),
        event.log.address,
        mapping.market_id,
        mapping.outcome,
        mapping.position_id,
        movement.itemIndex,
        movement.account,
        movement.direction,
        movement.amount.toString(),
        event.eventName,
      ],
    );
    affected.set(`${mapping.market_id}:${movement.account}:${mapping.position_id}`, {
      account: movement.account,
      mapping,
    });
  }

  const summaries = new Map<string, { account: string; marketId: string }>();
  for (const { account, mapping } of affected.values()) {
    await rebuildCtfPositionBalance(
      client,
      mapping,
      account,
      event.log.blockNumber,
      header.timestamp,
    );
    summaries.set(`${mapping.market_id}:${account}`, {
      account,
      marketId: mapping.market_id,
    });
  }
  for (const summary of summaries.values()) {
    await rebuildPositionSummary(
      client,
      summary.marketId,
      summary.account,
      event.log.blockNumber,
    );
  }
}

async function rebuildAssetBalance(
  client: PoolClient,
  tokenAddress: string,
  account: string,
  fallbackBlock: bigint,
  confirmedAt: Date,
): Promise<void> {
  const movementResult = await client.query<MovementRow>(
    `SELECT chain_id, transaction_hash, log_index, block_hash,
            block_number::text, 0 AS item_index, account, direction,
            amount::text, NULL::text AS position_id, canonical
       FROM asset_balance_movements
      WHERE chain_id = $1
        AND token_address = $2
        AND account = $3
      ORDER BY block_number, log_index, direction`,
    [CHAIN_ID, tokenAddress, account],
  );
  const replay = replayCanonicalBalance(
    movementResult.rows.map(toCanonicalMovement),
  );
  await client.query(
    `INSERT INTO asset_balances (
       wallet_address, balance, as_of_block, confirmed_at, updated_at,
       chain_id, token_address, decimals
     ) VALUES ($1, $2, $3, $4, now(), $5, $6, 6)
     ON CONFLICT (wallet_address) DO UPDATE SET
       balance = EXCLUDED.balance,
       as_of_block = EXCLUDED.as_of_block,
       confirmed_at = EXCLUDED.confirmed_at,
       updated_at = now(),
       chain_id = EXCLUDED.chain_id,
       token_address = EXCLUDED.token_address,
       decimals = EXCLUDED.decimals`,
    [
      account,
      replay.balance.toString(),
      (replay.asOfBlock ?? fallbackBlock).toString(),
      confirmedAt.toISOString(),
      CHAIN_ID,
      tokenAddress,
    ],
  );
}

async function projectFUsdTransfer(
  client: PoolClient,
  event: DecodedChainEvent,
  header: BlockHeader,
  fUsdAddress: Address,
): Promise<void> {
  if (event.log.address !== fUsdAddress) {
    throw new FatalIndexerError("Transfer event did not originate from configured fUSD");
  }
  const movements = expandTransferMovements(
    asAddress(event.args, "from"),
    asAddress(event.args, "to"),
    [{ amount: BigInt(asDecimal(event.args, "value")), itemIndex: 0, tokenId: null }],
  );
  for (const movement of movements) {
    await client.query(
      `INSERT INTO asset_balance_movements (
         chain_id, transaction_hash, log_index, block_hash, block_number,
         token_address, account, direction, amount, canonical, orphaned_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NULL)
       ON CONFLICT (
         chain_id, transaction_hash, log_index, block_hash, account, direction
       ) DO UPDATE SET
         canonical = true,
         orphaned_at = NULL`,
      [
        CHAIN_ID,
        event.log.transactionHash,
        event.log.logIndex,
        event.log.blockHash,
        event.log.blockNumber.toString(),
        fUsdAddress,
        movement.account,
        movement.direction,
        movement.amount.toString(),
      ],
    );
  }
  for (const account of new Set(movements.map((movement) => movement.account))) {
    await rebuildAssetBalance(
      client,
      fUsdAddress,
      account,
      event.log.blockNumber,
      header.timestamp,
    );
  }
}

async function linkChallengeEvent(
  client: PoolClient,
  event: DecodedChainEvent,
  marketId: string,
): Promise<void> {
  const challenger = asAddress(event.args, "challenger");
  const bond = asDecimal(event.args, "bond");
  const reasonHash = asHex(event.args, "reasonHash");
  const match = await client.query<{ id: string } & QueryResultRow>(
    `SELECT id
       FROM challenges
      WHERE market_id = $1
        AND lower(transaction_hash) = $2
        AND lower(wallet_address) = $3
        AND bond = $4::numeric
      LIMIT 2`,
    [marketId, event.log.transactionHash, challenger, bond],
  );
  const challengeId = match.rows.length === 1 ? match.rows[0]?.id ?? null : null;
  await client.query(
    `INSERT INTO challenge_event_links (
       chain_id, transaction_hash, log_index, block_hash, block_number,
       market_id, challenge_id, challenger_address, bond, reason_hash,
       canonical, orphaned_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NULL)
     ON CONFLICT (chain_id, transaction_hash, log_index, block_hash) DO UPDATE SET
       challenge_id = EXCLUDED.challenge_id,
       canonical = true,
       orphaned_at = NULL`,
    [
      CHAIN_ID,
      event.log.transactionHash,
      event.log.logIndex,
      event.log.blockHash,
      event.log.blockNumber.toString(),
      marketId,
      challengeId,
      challenger,
      bond,
      reasonHash,
    ],
  );
}

async function linkResolutionEvidenceEvent(
  client: PoolClient,
  event: DecodedChainEvent,
  marketId: string,
  outcome: number,
): Promise<void> {
  if (outcome !== 0 && outcome !== 1) {
    throw new FatalIndexerError(`ResolutionProposed emitted invalid outcome ${outcome}`);
  }
  const proposedOutcome = outcome === 0 ? "YES" : "NO";
  const evidenceHash = asHex(event.args, "evidenceHash");
  const match = await client.query<{ id: string } & QueryResultRow>(
    `SELECT id
       FROM resolution_evidence
      WHERE market_id = $1
        AND lower(transaction_hash) = $2
        AND lower(evidence_hash) = $3
        AND proposed_outcome = $4
      LIMIT 2`,
    [marketId, event.log.transactionHash, evidenceHash, proposedOutcome],
  );
  const evidenceId = match.rows.length === 1 ? match.rows[0]?.id ?? null : null;
  await client.query(
    `INSERT INTO resolution_evidence_event_links (
       chain_id, transaction_hash, log_index, block_hash, block_number,
       market_id, resolution_evidence_id, proposed_outcome, evidence_hash,
       canonical, orphaned_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NULL)
     ON CONFLICT (chain_id, transaction_hash, log_index, block_hash) DO UPDATE SET
       resolution_evidence_id = EXCLUDED.resolution_evidence_id,
       canonical = true,
       orphaned_at = NULL`,
    [
      CHAIN_ID,
      event.log.transactionHash,
      event.log.logIndex,
      event.log.blockHash,
      event.log.blockNumber.toString(),
      marketId,
      evidenceId,
      proposedOutcome,
      evidenceHash,
    ],
  );
}

async function storeStandardizedProjection(
  client: PoolClient,
  event: DecodedChainEvent,
  header: BlockHeader,
  projection: StandardizedProjection,
): Promise<void> {
  await client.query(
    `INSERT INTO indexed_market_events (
       chain_id, transaction_hash, log_index, block_hash, projection_type,
       market_id, contract_address, event_name, event_signature,
       actor_address, side, action, collateral_amount, share_amount,
       fee_amount, yes_reserve, no_reserve, outcome, cancelled, status_after,
       details, block_number, block_timestamp, projector_version
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
       $21::jsonb, $22, $23, $24
     )
     ON CONFLICT (
       chain_id, transaction_hash, log_index, block_hash, projection_type,
       projector_version
     ) DO NOTHING`,
    [
      CHAIN_ID,
      event.log.transactionHash,
      event.log.logIndex,
      event.log.blockHash,
      projection.projectionType,
      projection.marketId ?? null,
      event.log.address,
      event.eventName,
      event.definition.signature,
      projection.actorAddress ?? null,
      projection.side ?? null,
      projection.action ?? null,
      projection.collateralAmount ?? null,
      projection.shareAmount ?? null,
      projection.feeAmount ?? null,
      projection.yesReserve ?? null,
      projection.noReserve ?? null,
      projection.outcome ?? null,
      projection.cancelled ?? null,
      projection.statusAfter ?? null,
      JSON.stringify(jsonCompatible(projection.details ?? {})),
      event.log.blockNumber.toString(),
      header.timestamp.toISOString(),
      PROJECTOR_VERSION,
    ],
  );
}

async function upsertProbabilityHistory(
  client: PoolClient,
  event: DecodedChainEvent,
  marketId: string,
  yesProbabilityBps: bigint,
): Promise<void> {
  const update = await client.query(
    `UPDATE probability_history
        SET market_id = $5,
            block_number = $6,
            yes_probability_bps = $7,
            canonical = true,
            orphaned_at = NULL
      WHERE chain_id = $1
        AND transaction_hash = $2
        AND log_index = $3
        AND block_hash = $4`,
    [
      CHAIN_ID,
      event.log.transactionHash,
      event.log.logIndex,
      event.log.blockHash,
      marketId,
      event.log.blockNumber.toString(),
      yesProbabilityBps.toString(),
    ],
  );
  if (update.rowCount === 1) {
    return;
  }

  await client.query(
    `INSERT INTO probability_history (
       market_id, block_number, transaction_hash, yes_probability_bps,
       canonical, orphaned_at, chain_id, log_index, block_hash
     ) VALUES ($1, $2, $3, $4, true, NULL, $5, $6, $7)`,
    [
      marketId,
      event.log.blockNumber.toString(),
      event.log.transactionHash,
      yesProbabilityBps.toString(),
      CHAIN_ID,
      event.log.logIndex,
      event.log.blockHash,
    ],
  );
}

async function setMarketState(
  client: PoolClient,
  marketId: string,
  state:
    | "CANCELLED"
    | "DISPUTED"
    | "PROPOSED"
    | "RESOLVED",
  blockNumber: bigint,
): Promise<void> {
  await client.query(
    `UPDATE markets
        SET status = $2,
            confirmed_block = $3
      WHERE id = $1
        AND data_origin = 'CHAIN'`,
    [marketId, state, blockNumber.toString()],
  );
}

async function transitionOrder(
  client: PoolClient,
  orderId: string,
  fromStatus: string,
  toStatus: string,
  reason: string,
  transactionHash: string,
  blockNumber: bigint,
): Promise<boolean> {
  const update = await client.query(
    `UPDATE orders
        SET state = $3,
            updated_at = now()
      WHERE id = $1
        AND state = $2`,
    [orderId, fromStatus, toStatus],
  );
  if (update.rowCount !== 1) {
    return false;
  }

  await client.query(
    `INSERT INTO indexer_order_state_observations (
       order_id, from_status, to_status, reason, transaction_hash, block_number
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      orderId,
      fromStatus,
      toStatus,
      reason,
      transactionHash,
      blockNumber.toString(),
    ],
  );
  await client.query(
    `INSERT INTO order_state_history (
       order_id, from_state, to_state, reason, block_number
     ) VALUES ($1, $2, $3, $4, $5)`,
    [orderId, fromStatus, toStatus, reason, blockNumber.toString()],
  );
  return true;
}

async function transitionOrderAlongPath(
  client: PoolClient,
  order: OrderRow,
  target: "FAILED" | "INDEXED",
  transactionHash: string,
  blockNumber: bigint,
  reason: string,
): Promise<void> {
  const path = orderTransitionPath(order.state, target);
  if (!path) {
    return;
  }

  let currentStatus = order.state;
  for (const nextStatus of path) {
    const changed = await transitionOrder(
      client,
      order.id,
      currentStatus,
      nextStatus,
      reason,
      transactionHash,
      blockNumber,
    );
    if (!changed) {
      return;
    }
    currentStatus = nextStatus;
  }
}

async function advanceMatchingOrder(
  client: PoolClient,
  event: DecodedChainEvent,
  marketId: string,
  side: "NO" | "YES",
  action: "BUY" | "SELL",
  trader: Address,
  collateralAmount: string,
  shareAmount: string,
): Promise<void> {
  const result = await client.query<OrderRow>(
    `SELECT id, market_id, wallet_address, side, operation, amount, state,
            transaction_hash
       FROM orders
      WHERE lower(transaction_hash) = $1
      ORDER BY created_at`,
    [event.log.transactionHash],
  );
  const expectedAmount = action === "BUY" ? collateralAmount : shareAmount;

  for (const order of result.rows) {
    const matches =
      order.market_id === marketId &&
      order.wallet_address.toLowerCase() === trader &&
      order.side === side &&
      order.operation === action &&
      order.amount === expectedAmount;

    await transitionOrderAlongPath(
      client,
      order,
      matches ? "INDEXED" : "FAILED",
      event.log.transactionHash,
      event.log.blockNumber,
      matches ? "confirmed_trade_event" : "chain_event_mismatch",
    );
  }
}

async function writeTransactionObservation(
  client: PoolClient,
  event: DecodedChainEvent,
  canonical: boolean,
  reason: string,
  confirmations: bigint,
): Promise<void> {
  await client.query(
    `INSERT INTO indexer_transaction_observations (
       chain_id, transaction_hash, block_number, block_hash,
       successful, canonical, reason
     ) VALUES ($1, $2, $3, $4, true, $5, $6)
     ON CONFLICT (
       chain_id, transaction_hash, block_hash, canonical, reason
     ) DO NOTHING`,
    [
      CHAIN_ID,
      event.log.transactionHash,
      event.log.blockNumber.toString(),
      event.log.blockHash,
      canonical,
      reason,
    ],
  );
  await client.query(
    `INSERT INTO transaction_receipts (
       chain_id, transaction_hash, block_number, block_hash,
       status, confirmations, canonical, observed_at
     )
     SELECT $1, $2, $3, $4, 1, $5, true, now()
      WHERE COALESCE((
        SELECT canonical
          FROM transaction_receipts
         WHERE chain_id = $1
           AND transaction_hash = $2
         ORDER BY observed_at DESC
         LIMIT 1
      ), false) = false`,
    [
      CHAIN_ID,
      event.log.transactionHash,
      event.log.blockNumber.toString(),
      event.log.blockHash,
      confirmations.toString(),
    ],
  );
}

async function projectLiquidity(
  client: PoolClient,
  event: DecodedChainEvent,
  header: BlockHeader,
): Promise<void> {
  const marketId = await marketIdForAddress(client, event.log.address);
  const yesReserve = asDecimal(event.args, "yesReserve");
  const noReserve = asDecimal(event.args, "noReserve");
  const yesProbabilityBps = computeYesProbabilityBps(
    BigInt(yesReserve),
    BigInt(noReserve),
  );
  await client.query(
    `INSERT INTO market_reserves (
       market_id, yes_reserve, no_reserve, as_of_block,
       last_block_number, updated_at
     ) VALUES ($1, $2, $3, $4, $4, now())
     ON CONFLICT (market_id) DO UPDATE SET
       yes_reserve = EXCLUDED.yes_reserve,
       no_reserve = EXCLUDED.no_reserve,
       as_of_block = EXCLUDED.as_of_block,
       last_block_number = EXCLUDED.last_block_number,
       updated_at = now()`,
    [
      marketId,
      yesReserve,
      noReserve,
      event.log.blockNumber.toString(),
    ],
  );
  await upsertProbabilityHistory(
    client,
    event,
    marketId,
    yesProbabilityBps,
  );
  await client.query(
    `UPDATE markets
        SET yes_probability_bps = $2,
            confirmed_block = $3
      WHERE id = $1
        AND data_origin = 'CHAIN'`,
    [marketId, yesProbabilityBps.toString(), event.log.blockNumber.toString()],
  );
  await storeStandardizedProjection(client, event, header, {
    actorAddress: asAddress(event.args, "creator"),
    collateralAmount: asDecimal(event.args, "collateralAmount"),
    marketId,
    noReserve,
    projectionType: "LIQUIDITY_CHANGED",
    yesReserve,
  });
  await storeStandardizedProjection(client, event, header, {
    details: { yesProbabilityBps: yesProbabilityBps.toString() },
    marketId,
    noReserve,
    projectionType: "PROBABILITY_CHANGED",
    yesReserve,
  });
}

async function projectTrade(
  client: PoolClient,
  event: DecodedChainEvent,
  header: BlockHeader,
  confirmations: bigint,
): Promise<void> {
  const marketId = await marketIdForAddress(client, event.log.address);
  const trader = asAddress(event.args, "trader");
  const sideValue = BigInt(asDecimal(event.args, "side"));
  if (sideValue !== 0n && sideValue !== 1n) {
    throw new FatalIndexerError(`Trade emitted invalid side ${sideValue}`);
  }
  const side = sideValue === 0n ? "YES" : "NO";
  const action = asBoolean(event.args, "isBuy") ? "BUY" : "SELL";
  const collateralAmount = asDecimal(event.args, "collateralAmount");
  const shareAmount = asDecimal(event.args, "shareAmount");
  const feeAmount = asDecimal(event.args, "feeAmount");
  const yesReserve = asDecimal(event.args, "yesReserve");
  const noReserve = asDecimal(event.args, "noReserve");
  const yesProbabilityBps = computeYesProbabilityBps(
    BigInt(yesReserve),
    BigInt(noReserve),
  );

  await client.query(
    `INSERT INTO trades (
       market_id, chain_id, transaction_hash, log_index, wallet_address,
       side, action, collateral_amount, share_amount, fee_amount,
       block_number, canonical, orphaned_at, block_hash
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NULL, $12
     )
     ON CONFLICT (chain_id, transaction_hash, log_index) DO UPDATE SET
       market_id = EXCLUDED.market_id,
       wallet_address = EXCLUDED.wallet_address,
       side = EXCLUDED.side,
       action = EXCLUDED.action,
       collateral_amount = EXCLUDED.collateral_amount,
       share_amount = EXCLUDED.share_amount,
       fee_amount = EXCLUDED.fee_amount,
       block_number = EXCLUDED.block_number,
       canonical = true,
       orphaned_at = NULL,
       block_hash = EXCLUDED.block_hash`,
    [
      marketId,
      CHAIN_ID,
      event.log.transactionHash,
      event.log.logIndex,
      trader,
      side,
      action,
      collateralAmount,
      shareAmount,
      feeAmount,
      event.log.blockNumber.toString(),
      event.log.blockHash,
    ],
  );
  await client.query(
    `INSERT INTO market_reserves (
       market_id, yes_reserve, no_reserve, as_of_block,
       last_block_number, updated_at
     ) VALUES ($1, $2, $3, $4, $4, now())
     ON CONFLICT (market_id) DO UPDATE SET
       yes_reserve = EXCLUDED.yes_reserve,
       no_reserve = EXCLUDED.no_reserve,
       as_of_block = EXCLUDED.as_of_block,
       last_block_number = EXCLUDED.last_block_number,
       updated_at = now()`,
    [
      marketId,
      yesReserve,
      noReserve,
      event.log.blockNumber.toString(),
    ],
  );
  await upsertProbabilityHistory(
    client,
    event,
    marketId,
    yesProbabilityBps,
  );
  await client.query(
    `UPDATE markets
        SET yes_probability_bps = $2,
            volume = (
              SELECT COALESCE(sum(collateral_amount), 0)
                FROM trades
               WHERE market_id = $1
                 AND canonical = true
            ),
            confirmed_block = $3
      WHERE id = $1
        AND data_origin = 'CHAIN'`,
    [marketId, yesProbabilityBps.toString(), event.log.blockNumber.toString()],
  );
  await writeTransactionObservation(
    client,
    event,
    true,
    "confirmed_trade_event",
    confirmations,
  );
  await advanceMatchingOrder(
    client,
    event,
    marketId,
    side,
    action,
    trader,
    collateralAmount,
    shareAmount,
  );
  await storeStandardizedProjection(client, event, header, {
    action,
    actorAddress: trader,
    collateralAmount,
    feeAmount,
    marketId,
    noReserve,
    projectionType: "ORDER_FILLED",
    shareAmount,
    side,
    yesReserve,
  });
  await storeStandardizedProjection(client, event, header, {
    details: { yesProbabilityBps: yesProbabilityBps.toString() },
    marketId,
    noReserve,
    projectionType: "PROBABILITY_CHANGED",
    yesReserve,
  });
  await storeStandardizedProjection(client, event, header, {
    marketId,
    noReserve,
    projectionType: "LIQUIDITY_CHANGED",
    yesReserve,
  });
}

async function projectEvent(
  client: PoolClient,
  event: DecodedChainEvent,
  header: BlockHeader,
  confirmations: bigint,
  fUsdAddress: Address,
): Promise<void> {
  switch (event.eventName) {
    case "MarketCreated": {
      const marketAddress = asAddress(event.args, "market");
      const marketId = await marketIdForAddress(client, marketAddress);
      await storeStandardizedProjection(client, event, header, {
        actorAddress: asAddress(event.args, "creator"),
        details: {
          closeTime: asDecimal(event.args, "closeTime"),
          mechanismVersion: asDecimal(event.args, "mechanismVersion"),
          metadataHash: asHex(event.args, "metadataHash"),
          metadataURI: asString(event.args, "metadataURI"),
        },
        marketId,
        projectionType: "MARKET_CREATED",
        statusAfter: "OPEN",
      });
      break;
    }
    case "LiquidityInitialized":
      await projectLiquidity(client, event, header);
      break;
    case "Trade":
      await projectTrade(client, event, header, confirmations);
      break;
    case "ResolutionProposed": {
      const marketId = await marketIdForAddress(client, event.log.address);
      const outcome = asSmallInteger(event.args, "outcome");
      await setMarketState(
        client,
        marketId,
        "PROPOSED",
        event.log.blockNumber,
      );
      await linkResolutionEvidenceEvent(client, event, marketId, outcome);
      await storeStandardizedProjection(client, event, header, {
        details: {
          challengeDeadline: asDecimal(event.args, "challengeDeadline"),
          evidenceHash: asHex(event.args, "evidenceHash"),
        },
        marketId,
        outcome,
        projectionType: "MARKET_STATUS_CHANGED",
        statusAfter: "PROPOSED",
      });
      await storeStandardizedProjection(client, event, header, {
        details: {
          challengeDeadline: asDecimal(event.args, "challengeDeadline"),
          evidenceHash: asHex(event.args, "evidenceHash"),
        },
        marketId,
        outcome,
        projectionType: "SETTLEMENT",
        statusAfter: "PROPOSED",
      });
      break;
    }
    case "Challenged": {
      const marketId = await marketIdForAddress(client, event.log.address);
      await setMarketState(
        client,
        marketId,
        "DISPUTED",
        event.log.blockNumber,
      );
      await linkChallengeEvent(client, event, marketId);
      await storeStandardizedProjection(client, event, header, {
        actorAddress: asAddress(event.args, "challenger"),
        collateralAmount: asDecimal(event.args, "bond"),
        details: { reasonHash: asHex(event.args, "reasonHash") },
        marketId,
        projectionType: "MARKET_STATUS_CHANGED",
        statusAfter: "DISPUTED",
      });
      await storeStandardizedProjection(client, event, header, {
        actorAddress: asAddress(event.args, "challenger"),
        collateralAmount: asDecimal(event.args, "bond"),
        details: { reasonHash: asHex(event.args, "reasonHash") },
        marketId,
        projectionType: "SETTLEMENT",
        statusAfter: "DISPUTED",
      });
      break;
    }
    case "Finalized": {
      const marketId = await marketIdForAddress(client, event.log.address);
      const cancelled = asBoolean(event.args, "cancelled");
      const outcome = asSmallInteger(event.args, "finalOutcome");
      const statusAfter = cancelled ? "CANCELLED" : "RESOLVED";
      await setMarketState(
        client,
        marketId,
        statusAfter,
        event.log.blockNumber,
      );
      await storeStandardizedProjection(client, event, header, {
        cancelled,
        marketId,
        outcome,
        projectionType: "MARKET_STATUS_CHANGED",
        statusAfter,
      });
      await storeStandardizedProjection(client, event, header, {
        cancelled,
        marketId,
        outcome,
        projectionType: "SETTLEMENT",
        statusAfter,
      });
      break;
    }
    case "CancellationRoundingPolicy": {
      const marketId = await marketIdForAddress(client, event.log.address);
      await storeStandardizedProjection(client, event, header, {
        details: {
          accountingUnit: asString(event.args, "accountingUnit"),
          denominator: asDecimal(event.args, "denominator"),
        },
        marketId,
        projectionType: "SETTLEMENT",
      });
      break;
    }
    case "LiquidityRedeemed": {
      const marketId = await marketIdForAddress(client, event.log.address);
      const provider = asAddress(event.args, "provider");
      const collateralAmount = asDecimal(event.args, "collateralAmount");
      const reserveUpdate = await client.query(
        `UPDATE market_reserves
            SET yes_reserve = 0,
                no_reserve = 0,
                as_of_block = $2,
                last_block_number = $2,
                updated_at = now()
          WHERE market_id = $1`,
        [marketId, event.log.blockNumber.toString()],
      );
      if (reserveUpdate.rowCount !== 1) {
        throw new FatalIndexerError(
          `LiquidityRedeemed for ${event.log.address} has no indexed reserve state`,
        );
      }
      await client.query(
        `UPDATE markets
            SET confirmed_block = $2
          WHERE id = $1
            AND data_origin = 'CHAIN'`,
        [marketId, event.log.blockNumber.toString()],
      );
      await storeStandardizedProjection(client, event, header, {
        actorAddress: provider,
        collateralAmount,
        marketId,
        projectionType: "REDEMPTION",
      });
      await storeStandardizedProjection(client, event, header, {
        actorAddress: provider,
        collateralAmount,
        marketId,
        noReserve: "0",
        projectionType: "LIQUIDITY_CHANGED",
        yesReserve: "0",
      });
      break;
    }
    case "ConditionPreparation": {
      const oracle = asAddress(event.args, "oracle");
      const marketId = await optionalMarketIdForAddress(client, oracle);
      if (!marketId) break;
      if (asDecimal(event.args, "outcomeSlotCount") !== "2") {
        throw new FatalIndexerError("Project market condition must have exactly two outcomes");
      }
      await client.query(
        `UPDATE markets
            SET condition_id = $2,
                confirmed_block = $3
          WHERE id = $1
            AND data_origin = 'CHAIN'`,
        [
          marketId,
          asHex(event.args, "conditionId"),
          event.log.blockNumber.toString(),
        ],
      );
      await client.query(
        `INSERT INTO market_outcomes (market_id, side)
         VALUES ($1, 'YES'), ($1, 'NO')
         ON CONFLICT (market_id, side) DO NOTHING`,
        [marketId],
      );
      await storeStandardizedProjection(client, event, header, {
        actorAddress: oracle,
        details: {
          conditionId: asHex(event.args, "conditionId"),
          outcomeSlotCount: asDecimal(event.args, "outcomeSlotCount"),
          questionId: asHex(event.args, "questionId"),
        },
        marketId,
        projectionType: "CONDITION_PREPARED",
      });
      break;
    }
    case "ConditionResolution": {
      const conditionId = asHex(event.args, "conditionId");
      const marketId = await optionalMarketIdForCondition(client, conditionId);
      if (!marketId) break;
      if (asDecimal(event.args, "outcomeSlotCount") !== "2") {
        throw new FatalIndexerError("Project market resolution must have exactly two outcomes");
      }
      const payouts = parseBinaryPayoutNumerators(event.args.payoutNumerators);
      const payoutUpdate = await client.query(
        `UPDATE market_outcomes
            SET payout_numerator = CASE side
              WHEN 'YES' THEN $2::numeric
              WHEN 'NO' THEN $3::numeric
            END
          WHERE market_id = $1`,
        [marketId, payouts[0], payouts[1]],
      );
      if (payoutUpdate.rowCount !== 2) {
        throw new FatalIndexerError(
          `ConditionResolution ${conditionId} does not have exactly two indexed outcomes`,
        );
      }
      await storeStandardizedProjection(client, event, header, {
        actorAddress: asAddress(event.args, "oracle"),
        details: {
          conditionId,
          outcomeSlotCount: asDecimal(event.args, "outcomeSlotCount"),
          payoutNumerators: payouts,
          questionId: asHex(event.args, "questionId"),
        },
        marketId,
        projectionType: "SETTLEMENT",
      });
      break;
    }
    case "PayoutRedemption": {
      const conditionId = asHex(event.args, "conditionId");
      const marketId = await optionalMarketIdForCondition(client, conditionId);
      const collateralToken = asAddress(event.args, "collateralToken");
      if (!marketId || collateralToken !== fUsdAddress) break;
      await storeStandardizedProjection(client, event, header, {
        actorAddress: asAddress(event.args, "redeemer"),
        collateralAmount: asDecimal(event.args, "payout"),
        details: {
          collateralToken,
          conditionId,
          indexSets: jsonCompatible(event.args.indexSets),
          parentCollectionId: asHex(event.args, "parentCollectionId"),
        },
        marketId,
        projectionType: "REDEMPTION",
      });
      break;
    }
    case "PositionSplit":
    case "PositionsMerge": {
      const conditionId = asHex(event.args, "conditionId");
      const marketId = await optionalMarketIdForCondition(client, conditionId);
      const collateralToken = asAddress(event.args, "collateralToken");
      if (!marketId || collateralToken !== fUsdAddress) break;
      await storeStandardizedProjection(client, event, header, {
        actorAddress: asAddress(event.args, "stakeholder"),
        details: {
          conditionId,
          collateralToken,
          operation:
            event.eventName === "PositionSplit" ? "SPLIT" : "MERGE",
          parentCollectionId: asHex(event.args, "parentCollectionId"),
          partition: jsonCompatible(event.args.partition),
        },
        marketId,
        projectionType: "POSITION_CHANGED",
        shareAmount: asDecimal(event.args, "amount"),
      });
      break;
    }
    case "TransferSingle": {
      await projectCtfTransfer(client, event, header);
      break;
    }
    case "TransferBatch": {
      await projectCtfTransfer(client, event, header);
      break;
    }
    case "VoucherClaimed": {
      await storeStandardizedProjection(client, event, header, {
        actorAddress: asAddress(event.args, "wallet"),
        collateralAmount: asDecimal(event.args, "amount"),
        details: {
          claimId: asHex(event.args, "claimId"),
          nonce: asDecimal(event.args, "nonce"),
        },
        projectionType: "ASSET_ACTIVITY",
      });
      break;
    }
    case "Transfer": {
      await projectFUsdTransfer(client, event, header, fUsdAddress);
      await storeStandardizedProjection(client, event, header, {
        actorAddress: asAddress(event.args, "from"),
        collateralAmount: asDecimal(event.args, "value"),
        details: { to: asAddress(event.args, "to") },
        projectionType: "ASSET_ACTIVITY",
      });
      break;
    }
  }
}

async function rebuildReserveForMarket(
  client: PoolClient,
  marketAddress: string,
): Promise<void> {
  const marketResult = await client.query<MarketRow>(
    `SELECT id FROM markets WHERE lower(contract_address) = $1 LIMIT 1`,
    [marketAddress],
  );
  const market = marketResult.rows[0];
  if (!market) {
    return;
  }

  const eventResult = await client.query<CurrentEventRow>(
    `SELECT transaction_hash, log_index, block_number, block_hash,
            contract_address, event_name, event_args
       FROM indexer_current_events
      WHERE chain_id = $1
        AND contract_address = $2
        AND canonical = true
        AND event_name IN ('Trade', 'LiquidityInitialized', 'LiquidityRedeemed')
      ORDER BY block_number DESC, log_index DESC
      LIMIT 1`,
    [CHAIN_ID, marketAddress],
  );
  const latest = eventResult.rows[0];
  const redeemed = latest?.event_name === "LiquidityRedeemed";
  const yesReserve = latest && !redeemed
    ? asDecimal(latest.event_args, "yesReserve")
    : "0";
  const noReserve = latest && !redeemed
    ? asDecimal(latest.event_args, "noReserve")
    : "0";
  const blockNumber = latest?.block_number ?? "0";

  await client.query(
    `INSERT INTO market_reserves (
       market_id, yes_reserve, no_reserve, as_of_block,
       last_block_number, updated_at
     ) VALUES ($1, $2, $3, $4, $4, now())
     ON CONFLICT (market_id) DO UPDATE SET
       yes_reserve = EXCLUDED.yes_reserve,
       no_reserve = EXCLUDED.no_reserve,
       as_of_block = EXCLUDED.as_of_block,
       last_block_number = EXCLUDED.last_block_number,
       updated_at = now()`,
    [market.id, yesReserve, noReserve, blockNumber],
  );
}

async function rebuildMarketProjection(
  client: PoolClient,
  marketId: string,
  ancestorTimestamp: Date | null,
  creationWasRewound: boolean,
): Promise<void> {
  const marketResult = await client.query<MarketRow>(
    `SELECT id, contract_address, close_time
       FROM markets
      WHERE id = $1
        AND data_origin = 'CHAIN'
      LIMIT 1`,
    [marketId],
  );
  const market = marketResult.rows[0];
  if (!market) {
    return;
  }

  if (creationWasRewound) {
    const canonicalCreation = await client.query(
      `SELECT 1
         FROM current_indexed_market_events
        WHERE market_id = $1
          AND projection_type = 'MARKET_CREATED'
          AND canonical = true
        LIMIT 1`,
      [marketId],
    );
    if (canonicalCreation.rowCount === 0) {
      if (market.contract_address) {
        await client.query(
          `UPDATE indexer_contract_registry
              SET active = false,
                  updated_at = now()
            WHERE chain_id = $1
              AND address = $2
              AND source = 'FACTORY_EVENT'`,
          [CHAIN_ID, market.contract_address.toLowerCase()],
        );
      }
      await client.query(
        `UPDATE markets
            SET contract_address = NULL,
                confirmed_block = NULL,
                canonical = false
          WHERE id = $1`,
        [marketId],
      );
      return;
    }
  }

  const [statusResult, probabilityResult, aggregateResult, settlementResult] = await Promise.all([
    client.query<ProjectionRow>(
      `SELECT market_id, projection_type, status_after, block_number
         FROM current_indexed_market_events
        WHERE market_id = $1
          AND canonical = true
          AND status_after IS NOT NULL
        ORDER BY block_number DESC, log_index DESC
        LIMIT 1`,
      [marketId],
    ),
    client.query<ProbabilityRow>(
      `SELECT yes_probability_bps, block_number
         FROM probability_history
        WHERE market_id = $1
          AND canonical = true
        ORDER BY block_number DESC, log_index DESC NULLS LAST
        LIMIT 1`,
      [marketId],
    ),
    client.query<AggregateRow>(
      `SELECT COALESCE(sum(collateral_amount), 0)::text AS volume,
              max(block_number)::text AS confirmed_block
         FROM trades
        WHERE market_id = $1
          AND canonical = true`,
      [marketId],
    ),
    client.query<SettlementRow>(
      `SELECT details
         FROM current_indexed_market_events
        WHERE market_id = $1
          AND canonical = true
          AND projection_type = 'SETTLEMENT'
          AND event_name = 'ConditionResolution'
        ORDER BY block_number DESC, log_index DESC
        LIMIT 1`,
      [marketId],
    ),
  ]);

  let state = statusResult.rows[0]?.status_after ?? "OPEN";
  if (
    state === "OPEN" &&
    ancestorTimestamp &&
    market.close_time &&
    market.close_time <= ancestorTimestamp
  ) {
    state = "CLOSED";
  }
  const probability = probabilityResult.rows[0]?.yes_probability_bps ?? 5_000;
  const aggregate = aggregateResult.rows[0];
  const confirmedBlock =
    statusResult.rows[0]?.block_number ??
    probabilityResult.rows[0]?.block_number ??
    aggregate?.confirmed_block ??
    null;

  await client.query(
    `UPDATE markets
        SET status = $2,
            yes_probability_bps = $3,
            volume = $4,
            confirmed_block = $5,
            canonical = true
      WHERE id = $1`,
    [
      marketId,
      state,
      probability,
      aggregate?.volume ?? "0",
      confirmedBlock,
    ],
  );
  await client.query(
    `INSERT INTO market_outcomes (market_id, side)
     VALUES ($1, 'YES'), ($1, 'NO')
     ON CONFLICT (market_id, side) DO NOTHING`,
    [marketId],
  );
  const settlement = settlementResult.rows[0];
  const payouts = settlement
    ? parseBinaryPayoutNumerators(settlement.details.payoutNumerators)
    : null;
  await client.query(
    `UPDATE market_outcomes
        SET payout_numerator = CASE
          WHEN $2::numeric IS NULL THEN NULL
          WHEN side = 'YES' THEN $2::numeric
          ELSE $3::numeric
        END
      WHERE market_id = $1`,
    [marketId, payouts?.[0] ?? null, payouts?.[1] ?? null],
  );

  if (market.contract_address) {
    await rebuildReserveForMarket(
      client,
      market.contract_address.toLowerCase(),
    );
  }
}

async function rewindFromBlock(
  client: PoolClient,
  fromBlock: bigint,
  ancestor: BlockHeader | null,
  oldCheckpoint: Checkpoint | null,
  reason: "manual_resync" | "reorg",
  startBlock: bigint,
): Promise<void> {
  const affectedResult = await client.query<CurrentEventRow>(
    `SELECT transaction_hash, log_index, block_number, block_hash,
            contract_address, event_name, event_args
       FROM indexer_current_events
      WHERE chain_id = $1
        AND canonical = true
        AND block_number >= $2
      ORDER BY block_number, log_index`,
    [CHAIN_ID, fromBlock.toString()],
  );
  const transactionHashes = [
    ...new Set(affectedResult.rows.map((row) => row.transaction_hash)),
  ];
  const marketAddresses = [
    ...new Set(affectedResult.rows.map((row) => row.contract_address)),
  ];
  const affectedProjectionResult = await client.query<ProjectionRow>(
    `SELECT DISTINCT market_id, projection_type, block_number, status_after
       FROM current_indexed_market_events
      WHERE chain_id = $1
        AND canonical = true
        AND block_number >= $2
        AND market_id IS NOT NULL`,
    [CHAIN_ID, fromBlock.toString()],
  );
  const affectedMarketIds = [
    ...new Set(affectedProjectionResult.rows.map((row) => row.market_id)),
  ];
  const rewoundCreations = new Set(
    affectedProjectionResult.rows
      .filter((row) => row.projection_type === "MARKET_CREATED")
      .map((row) => row.market_id),
  );
  const affectedPositions = await client.query<AffectedPositionRow>(
    `SELECT DISTINCT ctf_address, market_id, outcome, position_id::text, account
       FROM ctf_position_movements
      WHERE chain_id = $1
        AND canonical = true
        AND block_number >= $2`,
    [CHAIN_ID, fromBlock.toString()],
  );
  const affectedAssets = await client.query<AffectedAssetRow>(
    `SELECT DISTINCT token_address, account
       FROM asset_balance_movements
      WHERE chain_id = $1
        AND canonical = true
        AND block_number >= $2`,
    [CHAIN_ID, fromBlock.toString()],
  );

  await client.query(
    `INSERT INTO chain_event_canonicality (
       chain_id, transaction_hash, log_index, block_hash, canonical, reason
     )
     SELECT chain_id, transaction_hash, log_index, block_hash, false, $3
       FROM indexer_current_events
      WHERE chain_id = $1
        AND canonical = true
        AND block_number >= $2`,
    [CHAIN_ID, fromBlock.toString(), reason],
  );
  await client.query(
    `UPDATE indexed_blocks
        SET canonical = false,
            orphaned_at = COALESCE(orphaned_at, now())
      WHERE chain_id = $1
        AND number >= $2
        AND canonical = true`,
    [CHAIN_ID, fromBlock.toString()],
  );
  await client.query(
    `UPDATE trades
        SET canonical = false,
            orphaned_at = now()
      WHERE chain_id = $1
        AND block_number >= $2
        AND canonical = true`,
    [CHAIN_ID, fromBlock.toString()],
  );
  await client.query(
    `UPDATE probability_history
        SET canonical = false,
            orphaned_at = now()
      WHERE chain_id = $1
        AND block_number >= $2
        AND canonical = true`,
    [CHAIN_ID, fromBlock.toString()],
  );
  await client.query(
    `UPDATE market_outcomes outcome
        SET position_id = NULL
       FROM ctf_position_mappings mapping
      WHERE mapping.market_id = outcome.market_id
        AND mapping.outcome = outcome.side
        AND mapping.chain_id = $1
        AND mapping.source_block_number >= $2
        AND mapping.canonical = true`,
    [CHAIN_ID, fromBlock.toString()],
  );
  await client.query(
    `UPDATE ctf_position_mappings
        SET canonical = false,
            orphaned_at = now(),
            updated_at = now()
      WHERE chain_id = $1
        AND source_block_number >= $2
        AND canonical = true`,
    [CHAIN_ID, fromBlock.toString()],
  );
  await client.query(
    `UPDATE ctf_position_movements
        SET canonical = false,
            orphaned_at = now()
      WHERE chain_id = $1
        AND block_number >= $2
        AND canonical = true`,
    [CHAIN_ID, fromBlock.toString()],
  );
  await client.query(
    `UPDATE asset_balance_movements
        SET canonical = false,
            orphaned_at = now()
      WHERE chain_id = $1
        AND block_number >= $2
        AND canonical = true`,
    [CHAIN_ID, fromBlock.toString()],
  );
  for (const table of ["challenge_event_links", "resolution_evidence_event_links"] as const) {
    await client.query(
      `UPDATE ${table}
          SET canonical = false,
              orphaned_at = now()
        WHERE chain_id = $1
          AND block_number >= $2
          AND canonical = true`,
      [CHAIN_ID, fromBlock.toString()],
    );
  }

  if (transactionHashes.length > 0) {
    const orderResult = await client.query<OrderRow>(
      `SELECT id, market_id, wallet_address, side, operation, amount, state,
              transaction_hash
         FROM orders
        WHERE lower(transaction_hash) = ANY($1::text[])
          AND state IN ('CONFIRMED', 'INDEXED')
        ORDER BY created_at`,
      [transactionHashes],
    );
    for (const order of orderResult.rows) {
      const nextStatus = order.state === "INDEXED" ? "ORPHANED" : "REORGED";
      await transitionOrder(
        client,
        order.id,
        order.state,
        nextStatus,
        reason,
        order.transaction_hash ?? "",
        fromBlock,
      );
    }

    await client.query(
      `INSERT INTO indexer_transaction_observations (
         chain_id, transaction_hash, block_number, block_hash,
         successful, canonical, reason
       )
       SELECT DISTINCT $1, event.transaction_hash, event.block_number,
              event.block_hash, true, false, $3
         FROM indexer_current_events event
        WHERE event.chain_id = $1
          AND event.transaction_hash = ANY($2::text[])
       ON CONFLICT (
         chain_id, transaction_hash, block_hash, canonical, reason
       ) DO NOTHING`,
      [CHAIN_ID, transactionHashes, reason],
    );
    await client.query(
      `INSERT INTO transaction_receipts (
         chain_id, transaction_hash, block_number, block_hash,
         status, confirmations, canonical, observed_at
       )
       SELECT receipt.chain_id, receipt.transaction_hash, receipt.block_number,
              receipt.block_hash, receipt.status, receipt.confirmations, false, now()
         FROM (
           SELECT DISTINCT ON (transaction_hash)
                  chain_id, transaction_hash, block_number, block_hash,
                  status, confirmations, canonical
             FROM transaction_receipts
            WHERE chain_id = $1
              AND transaction_hash = ANY($2::text[])
            ORDER BY transaction_hash, observed_at DESC
         ) receipt
        WHERE receipt.canonical = true`,
      [CHAIN_ID, transactionHashes],
    );
  }

  const fallbackBlock = ancestor?.number ?? 0n;
  const confirmedAt = ancestor?.timestamp ?? new Date(0);
  const affectedSummaries = new Map<string, { account: string; marketId: string }>();
  for (const row of affectedPositions.rows) {
    await rebuildCtfPositionBalance(
      client,
      row,
      row.account,
      fallbackBlock,
      confirmedAt,
    );
    affectedSummaries.set(`${row.market_id}:${row.account}`, {
      account: row.account,
      marketId: row.market_id,
    });
  }
  for (const summary of affectedSummaries.values()) {
    await rebuildPositionSummary(
      client,
      summary.marketId,
      summary.account,
      fallbackBlock,
    );
  }
  for (const row of affectedAssets.rows) {
    await rebuildAssetBalance(
      client,
      row.token_address,
      row.account,
      fallbackBlock,
      confirmedAt,
    );
  }

  for (const marketAddress of marketAddresses) {
    await rebuildReserveForMarket(client, marketAddress);
  }
  for (const marketId of affectedMarketIds) {
    await rebuildMarketProjection(
      client,
      marketId,
      ancestor?.timestamp ?? null,
      rewoundCreations.has(marketId),
    );
  }

  await writeCheckpoint(client, {
    currentBlock: ancestor?.number ?? -1n,
    currentHash: ancestor?.hash ?? null,
    parentHash: ancestor?.parentHash ?? null,
    startBlock,
  });
  await client.query(
    `INSERT INTO indexer_reorgs (
       chain_id, old_checkpoint_block, old_checkpoint_hash,
       ancestor_block, ancestor_hash, rewind_from_block, reason
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      CHAIN_ID,
      oldCheckpoint?.currentBlock.toString() ?? null,
      oldCheckpoint?.currentHash ?? null,
      ancestor?.number.toString() ?? null,
      ancestor?.hash ?? null,
      fromBlock.toString(),
      reason,
    ],
  );
}

async function findCommonAncestor(
  client: PoolClient,
  rpc: ReturnType<typeof createPublicClient>,
  checkpoint: Checkpoint,
  maxDepth: bigint,
): Promise<BlockHeader> {
  let candidateNumber = checkpoint.currentBlock;
  const minimum = checkpoint.currentBlock > maxDepth
    ? checkpoint.currentBlock - maxDepth
    : 0n;

  while (candidateNumber >= minimum) {
    const storedResult = await client.query<BlockRow>(
      `SELECT number, hash, parent_hash
         FROM indexed_blocks
        WHERE chain_id = $1
          AND number = $2
          AND canonical = true
        ORDER BY hash
        LIMIT 1`,
      [CHAIN_ID, candidateNumber.toString()],
    );
    const stored = storedResult.rows[0];
    if (stored) {
      const chainBlock = await fetchHeader(rpc, candidateNumber);
      if (chainBlock.hash === normalizeHash(stored.hash)) {
        return chainBlock;
      }
    }

    if (candidateNumber === 0n) {
      break;
    }
    candidateNumber -= 1n;
  }

  throw new FatalIndexerError(
    `Reorg exceeds INDEXER_MAX_REORG_DEPTH=${maxDepth}; run an explicit --resync`,
  );
}

async function ensureCanonicalCheckpoint(
  client: PoolClient,
  rpc: ReturnType<typeof createPublicClient>,
  config: IndexerConfig,
  checkpoint: Checkpoint | null,
): Promise<boolean> {
  if (
    checkpoint === null ||
    checkpoint.currentBlock < 0n ||
    checkpoint.currentHash === null
  ) {
    return false;
  }

  const current = await fetchHeader(rpc, checkpoint.currentBlock);
  if (current.hash === checkpoint.currentHash) {
    return false;
  }

  const ancestor = await findCommonAncestor(
    client,
    rpc,
    checkpoint,
    config.maxReorgDepth,
  );
  await inTransaction(client, () =>
    rewindFromBlock(
      client,
      ancestor.number + 1n,
      ancestor,
      checkpoint,
      "reorg",
      checkpoint.startBlock,
    ),
  );
  return true;
}

async function closeMarketsAtConfirmedBlock(
  client: PoolClient,
  header: BlockHeader,
): Promise<void> {
  await client.query(
    `UPDATE markets
        SET status = 'CLOSED',
            confirmed_block = $2
      WHERE chain_id = $1
        AND data_origin = 'CHAIN'
        AND canonical = true
        AND status = 'OPEN'
        AND close_time <= $3`,
    [CHAIN_ID, header.number.toString(), header.timestamp.toISOString()],
  );
}

async function processRange(
  client: PoolClient,
  rpc: ReturnType<typeof createPublicClient>,
  config: IndexerConfig,
  factoryAddress: Address,
  checkpoint: Checkpoint | null,
  fromBlock: bigint,
  toBlock: bigint,
  latestBlock: bigint,
  metrics: BatchMetrics,
): Promise<void> {
  const headers = await fetchHeaders(rpc, fromBlock, toBlock);
  validateHeaderChain(headers, checkpoint);
  const registry = await loadRegisteredContracts(client, toBlock);
  const events = await fetchDecodedEvents(
    rpc,
    registry,
    factoryAddress,
    fromBlock,
    toBlock,
    metrics,
  );
  const headersByNumber = new Map(
    headers.map((header) => [header.number.toString(), header]),
  );
  const fUsdAddress = config.contracts.find(
    (contract) => contract.kind === "FUSD",
  )?.address;
  if (!fUsdAddress) {
    throw new FatalIndexerError("FUSD contract is missing from the registry configuration");
  }
  const ctfAddress = config.contracts.find(
    (contract) => contract.kind === "CTF",
  )?.address;
  if (!ctfAddress) {
    throw new FatalIndexerError("CTF contract is missing from the registry configuration");
  }

  await inTransaction(client, async () => {
    for (const header of headers) {
      await storeBlock(client, header);
    }

    await registerCreatedMarkets(
      client,
      rpc,
      events,
      factoryAddress,
      ctfAddress,
      fUsdAddress,
    );

    for (const event of events) {
      const header = headersByNumber.get(event.log.blockNumber.toString());
      if (!header || header.hash !== event.log.blockHash) {
        throw new Error(
          `Log block hash does not match fetched header at ${event.log.blockNumber}`,
        );
      }
      await storeEvent(client, event, header);
      const confirmations = latestBlock >= event.log.blockNumber
        ? latestBlock - event.log.blockNumber
        : 0n;
      await projectEvent(
        client,
        event,
        header,
        confirmations,
        fUsdAddress,
      );
      metrics.processedEvents += 1;
    }

    const finalHeader = headers.at(-1);
    if (!finalHeader) {
      throw new FatalIndexerError("Missing final block header");
    }
    const currentFinalHeader = await fetchHeader(rpc, finalHeader.number);
    if (currentFinalHeader.hash !== finalHeader.hash) {
      throw new Error(
        `Canonical block changed while processing range ending ${toBlock}`,
      );
    }

    await closeMarketsAtConfirmedBlock(client, finalHeader);

    await writeCheckpoint(client, {
      currentBlock: finalHeader.number,
      currentHash: finalHeader.hash,
      parentHash: finalHeader.parentHash,
      startBlock: checkpoint?.startBlock ?? fromBlock,
    });
  });
}

async function assertAmoy(
  rpc: ReturnType<typeof createPublicClient>,
): Promise<void> {
  const chainId = await rpc.getChainId();
  if (chainId !== CHAIN_ID) {
    throw new FatalIndexerError(
      `Indexer requires Polygon Amoy chainId ${CHAIN_ID}; RPC returned ${chainId}`,
    );
  }
}

async function runBatch(
  client: PoolClient,
  rpc: ReturnType<typeof createPublicClient>,
  config: IndexerConfig,
  requestedStart: bigint,
  requestedEnd: bigint | undefined,
  metrics: BatchMetrics,
): Promise<BatchResult> {
  await assertAmoy(rpc);
  const latestBlock = await rpc.getBlockNumber();
  const safeTip =
    latestBlock >= config.confirmations
      ? latestBlock - config.confirmations
      : -1n;
  let checkpoint = await readCheckpoint(client);

  if (
    await ensureCanonicalCheckpoint(client, rpc, config, checkpoint)
  ) {
    checkpoint = await readCheckpoint(client);
    return {
      currentBlock: checkpoint?.currentBlock ?? -1n,
      didProcess: false,
      latestBlock,
      reorged: true,
    };
  }

  const fromBlock =
    checkpoint === null ? requestedStart : checkpoint.currentBlock + 1n;
  const boundedTip =
    requestedEnd === undefined || requestedEnd > safeTip
      ? safeTip
      : requestedEnd;
  if (boundedTip < fromBlock) {
    return {
      currentBlock: checkpoint?.currentBlock ?? fromBlock - 1n,
      didProcess: false,
      latestBlock,
      reorged: false,
    };
  }

  const batchEnd = fromBlock + BigInt(config.batchSize - 1);
  const toBlock = batchEnd < boundedTip ? batchEnd : boundedTip;
  await processRange(
    client,
    rpc,
    config,
    config.contracts.find((contract) => contract.kind === "FACTORY")?.address ??
      requiredAddress("INDEXER_FACTORY_ADDRESS", ZERO_ADDRESS),
    checkpoint,
    fromBlock,
    toBlock,
    latestBlock,
    metrics,
  );

  return {
    currentBlock: toBlock,
    didProcess: true,
    latestBlock,
    reorged: false,
  };
}

async function performManualResync(
  client: PoolClient,
  rpc: ReturnType<typeof createPublicClient>,
  config: IndexerConfig,
  fromBlock: bigint,
): Promise<void> {
  await assertAmoy(rpc);
  const oldCheckpoint = await readCheckpoint(client);
  const ancestor =
    fromBlock === 0n ? null : await fetchHeader(rpc, fromBlock - 1n);
  await inTransaction(client, () =>
    rewindFromBlock(
      client,
      fromBlock,
      ancestor,
      oldCheckpoint,
      "manual_resync",
      fromBlock,
    ),
  );
}

function usage(): string {
  return [
    "Prediction Market Polygon Amoy indexer",
    "",
    "Options:",
    "  --from-block N  Initial block (or rewind point with --resync)",
    "  --to-block N    Stop after this confirmed block",
    "  --resync         Mark data from --from-block non-canonical and replay",
    "  --once           Process one batch, or the complete --to-block range",
    "  --help           Show this help",
  ].join("\n");
}

async function main(): Promise<void> {
  let cli;
  try {
    cli = parseIndexerArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${safeError(error).message}\n`);
    process.exitCode = 1;
    return;
  }

  if (cli.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  let config: IndexerConfig;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    process.stderr.write(`${safeError(error).message}\n`);
    process.exitCode = 1;
    return;
  }

  const logger = pino({
    base: { chainId: CHAIN_ID, service: "prediction-market-indexer" },
    level: config.logLevel,
    redact: {
      paths: ["databaseUrl", "rpcUrl", "*.databaseUrl", "*.rpcUrl"],
      remove: true,
    },
  });
  const pool = new Pool({
    application_name: "prediction-market-indexer",
    connectionString: config.databaseUrl,
    max: 4,
  });
  const rpc = createPublicClient({
    chain: polygonAmoy,
    transport: http(config.rpcUrl, { retryCount: 0, timeout: 15_000 }),
  });
  let shuttingDown = false;
  let batchInFlight = false;

  const requestShutdown = (signal: string): void => {
    shuttingDown = true;
    logger.info({ event: "shutdown_requested", signal });
  };
  process.once("SIGINT", () => requestShutdown("SIGINT"));
  process.once("SIGTERM", () => requestShutdown("SIGTERM"));

  async function withRetry<T>(
    operationName: string,
    metrics: BatchMetrics,
    operation: () => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= config.maxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof FatalIndexerError) {
          throw error;
        }
        lastError = error;
        metrics.retryCount += 1;
        if (attempt === config.maxRetries) {
          break;
        }
        const delayMs = retryDelayMs(
          attempt,
          config.retryBaseMs,
          config.retryMaxMs,
        );
        logger.warn({
          ...safeError(error),
          delayMs,
          event: "operation_retry",
          operation: operationName,
          retryCount: metrics.retryCount,
        });
        await sleep(delayMs);
      }
    }

    throw new FatalIndexerError(
      `${operationName} failed after ${config.maxRetries} attempts: ${safeError(lastError).message}`,
    );
  }

  async function exclusive<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T | null> {
    if (batchInFlight) {
      throw new FatalIndexerError("Concurrent local indexer batch rejected");
    }

    batchInFlight = true;
    let client: PoolClient | undefined;
    let lockHeld = false;
    let destroyClient = false;
    try {
      client = await pool.connect();
      const lockResult = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [CHAIN_ID],
      );
      lockHeld = lockResult.rows[0]?.locked === true;
      if (!lockHeld) {
        return null;
      }
      return await operation(client);
    } catch (error) {
      destroyClient = true;
      throw error;
    } finally {
      if (client) {
        if (lockHeld) {
          try {
            await client.query("SELECT pg_advisory_unlock($1)", [CHAIN_ID]);
          } catch {
            destroyClient = true;
          }
        }
        client.release(destroyClient);
      }
      batchInFlight = false;
    }
  }

  async function waitForExclusive<T>(
    operationName: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    while (!shuttingDown) {
      const metrics: BatchMetrics = {
        failedEvents: 0,
        processedEvents: 0,
        retryCount: 0,
      };
      const result = await withRetry(operationName, metrics, () =>
        exclusive(async (client) => ({
          value: await operation(client),
        })),
      );
      if (result !== null) {
        return result.value;
      }
      logger.info({ event: "batch_skipped", reason: "advisory_lock_held" });
      await sleep(config.pollIntervalMs);
    }
    throw new FatalIndexerError("Indexer stopped before acquiring its lock");
  }

  try {
    await waitForExclusive("bootstrap_contract_registry", (client) =>
      bootstrapContracts(client, config),
    );

    const initialCheckpoint = await waitForExclusive(
      "read_initial_checkpoint",
      readCheckpoint,
    );
    if (
      !cli.resync &&
      cli.fromBlock !== undefined &&
      initialCheckpoint !== null &&
      cli.fromBlock !== initialCheckpoint.currentBlock + 1n
    ) {
      throw new FatalIndexerError(
        `Checkpoint resumes at ${initialCheckpoint.currentBlock + 1n}; use --resync to start at ${cli.fromBlock}`,
      );
    }

    if (cli.resync && cli.fromBlock !== undefined) {
      await waitForExclusive("manual_resync", (client) =>
        withRetry(
          "manual_resync_transaction",
          { failedEvents: 0, processedEvents: 0, retryCount: 0 },
          () => performManualResync(client, rpc, config, cli.fromBlock ?? 0n),
        ),
      );
      logger.warn({
        event: "manual_resync_prepared",
        fromBlock: cli.fromBlock.toString(),
        toBlock: cli.toBlock?.toString(),
      });
    }

    const requestedStart = cli.fromBlock ?? config.startBlock;
    let processedBatchCount = 0;

    while (!shuttingDown) {
      const metrics: BatchMetrics = {
        failedEvents: 0,
        processedEvents: 0,
        retryCount: 0,
      };
      const result = await withRetry("indexer_batch", metrics, () =>
        exclusive((client) =>
          runBatch(
            client,
            rpc,
            config,
            requestedStart,
            cli.toBlock,
            metrics,
          ),
        ),
      );

      if (result === null) {
        logger.info({
          event: "batch_skipped",
          failedEvents: metrics.failedEvents,
          processedEvents: metrics.processedEvents,
          reason: "advisory_lock_held",
          retryCount: metrics.retryCount,
        });
        await sleep(config.pollIntervalMs);
        continue;
      }

      const lag =
        result.latestBlock > result.currentBlock
          ? result.latestBlock - result.currentBlock
          : 0n;
      logger.info({
        currentBlock: result.currentBlock.toString(),
        event: result.reorged
          ? "reorg_rewound"
          : result.didProcess
            ? "batch_complete"
            : "batch_idle",
        failedEvents: metrics.failedEvents,
        lag: lag.toString(),
        latestBlock: result.latestBlock.toString(),
        processedEvents: metrics.processedEvents,
        retryCount: metrics.retryCount,
      });

      if (result.reorged) {
        continue;
      }
      if (result.didProcess) {
        processedBatchCount += 1;
      }
      if (
        cli.toBlock !== undefined &&
        result.currentBlock >= cli.toBlock
      ) {
        break;
      }
      if (
        cli.once &&
        (cli.toBlock === undefined ||
          !result.didProcess ||
          result.currentBlock >= cli.toBlock)
      ) {
        break;
      }
      if (!result.didProcess || processedBatchCount > 0) {
        await sleep(result.didProcess ? 0 : config.pollIntervalMs);
      }
    }
  } catch (error) {
    logger.fatal({
      ...safeError(error),
      event: "indexer_stopped",
    });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();

