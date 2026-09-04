import { parseAbi, toEventSelector, type Hex } from "viem";

export type ProjectContractKind = "CTF" | "FACTORY" | "FUSD" | "MARKET";

export interface ProjectEventDefinition {
  readonly eventName: string;
  readonly indexedNames: readonly string[];
  readonly kinds: readonly ProjectContractKind[];
  readonly signature: string;
  readonly topic0: Hex;
}

export const PROJECT_EVENT_ABI = parseAbi([
  // BinaryMarket events, sourced from the local Foundry artifact.
  "event CancellationRoundingPolicy(uint256 denominator,string accountingUnit)",
  "event Challenged(address indexed challenger,uint256 bond,bytes32 reasonHash)",
  "event Finalized(uint8 finalOutcome,bool cancelled)",
  "event LiquidityInitialized(address indexed creator,uint256 collateralAmount,uint256 yesReserve,uint256 noReserve)",
  "event LiquidityRedeemed(address indexed provider,uint256 collateralAmount)",
  "event ResolutionProposed(uint8 outcome,bytes32 evidenceHash,uint256 challengeDeadline)",
  "event Trade(address indexed trader,uint8 indexed side,bool isBuy,uint256 collateralAmount,uint256 shareAmount,uint256 feeAmount,uint256 yesReserve,uint256 noReserve)",
  // MarketFactory events, sourced from the local Foundry artifact.
  "event EIP712DomainChanged()",
  "event MarketCreated(address indexed market,address indexed creator,bytes32 indexed metadataHash,string metadataURI,uint64 closeTime,uint256 mechanismVersion)",
  "event RoleAdminChanged(bytes32 indexed role,bytes32 indexed previousAdminRole,bytes32 indexed newAdminRole)",
  "event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)",
  "event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)",
  // ForecastTestUSD events, sourced from the local Foundry artifact.
  "event Approval(address indexed owner,address indexed spender,uint256 value)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "event VoucherClaimed(bytes32 indexed claimId,address indexed wallet,uint256 amount,uint256 nonce)",
  // Gnosis Conditional Tokens and its ERC-1155 base events.
  "event ConditionPreparation(bytes32 indexed conditionId,address indexed oracle,bytes32 indexed questionId,uint256 outcomeSlotCount)",
  "event ConditionResolution(bytes32 indexed conditionId,address indexed oracle,bytes32 indexed questionId,uint256 outcomeSlotCount,uint256[] payoutNumerators)",
  "event PositionSplit(address indexed stakeholder,address collateralToken,bytes32 indexed parentCollectionId,bytes32 indexed conditionId,uint256[] partition,uint256 amount)",
  "event PositionsMerge(address indexed stakeholder,address collateralToken,bytes32 indexed parentCollectionId,bytes32 indexed conditionId,uint256[] partition,uint256 amount)",
  "event PayoutRedemption(address indexed redeemer,address indexed collateralToken,bytes32 indexed parentCollectionId,bytes32 conditionId,uint256[] indexSets,uint256 payout)",
  "event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)",
  "event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)",
  "event ApprovalForAll(address indexed owner,address indexed operator,bool approved)",
  "event URI(string value,uint256 indexed id)",
]);

type DefinitionInput = Omit<ProjectEventDefinition, "topic0">;

function define(input: DefinitionInput): ProjectEventDefinition {
  return {
    ...input,
    topic0: toEventSelector(input.signature),
  };
}

export const PROJECT_EVENT_DEFINITIONS = [
  define({
    eventName: "CancellationRoundingPolicy",
    indexedNames: [],
    kinds: ["MARKET"],
    signature: "CancellationRoundingPolicy(uint256,string)",
  }),
  define({
    eventName: "Challenged",
    indexedNames: ["challenger"],
    kinds: ["MARKET"],
    signature: "Challenged(address,uint256,bytes32)",
  }),
  define({
    eventName: "Finalized",
    indexedNames: [],
    kinds: ["MARKET"],
    signature: "Finalized(uint8,bool)",
  }),
  define({
    eventName: "LiquidityInitialized",
    indexedNames: ["creator"],
    kinds: ["MARKET"],
    signature: "LiquidityInitialized(address,uint256,uint256,uint256)",
  }),
  define({
    eventName: "LiquidityRedeemed",
    indexedNames: ["provider"],
    kinds: ["MARKET"],
    signature: "LiquidityRedeemed(address,uint256)",
  }),
  define({
    eventName: "ResolutionProposed",
    indexedNames: [],
    kinds: ["MARKET"],
    signature: "ResolutionProposed(uint8,bytes32,uint256)",
  }),
  define({
    eventName: "Trade",
    indexedNames: ["trader", "side"],
    kinds: ["MARKET"],
    signature: "Trade(address,uint8,bool,uint256,uint256,uint256,uint256,uint256)",
  }),
  define({
    eventName: "EIP712DomainChanged",
    indexedNames: [],
    kinds: ["FACTORY", "FUSD"],
    signature: "EIP712DomainChanged()",
  }),
  define({
    eventName: "MarketCreated",
    indexedNames: ["market", "creator", "metadataHash"],
    kinds: ["FACTORY"],
    signature: "MarketCreated(address,address,bytes32,string,uint64,uint256)",
  }),
  define({
    eventName: "RoleAdminChanged",
    indexedNames: ["role", "previousAdminRole", "newAdminRole"],
    kinds: ["FACTORY", "FUSD"],
    signature: "RoleAdminChanged(bytes32,bytes32,bytes32)",
  }),
  define({
    eventName: "RoleGranted",
    indexedNames: ["role", "account", "sender"],
    kinds: ["FACTORY", "FUSD"],
    signature: "RoleGranted(bytes32,address,address)",
  }),
  define({
    eventName: "RoleRevoked",
    indexedNames: ["role", "account", "sender"],
    kinds: ["FACTORY", "FUSD"],
    signature: "RoleRevoked(bytes32,address,address)",
  }),
  define({
    eventName: "Approval",
    indexedNames: ["owner", "spender"],
    kinds: ["FUSD"],
    signature: "Approval(address,address,uint256)",
  }),
  define({
    eventName: "Transfer",
    indexedNames: ["from", "to"],
    kinds: ["FUSD"],
    signature: "Transfer(address,address,uint256)",
  }),
  define({
    eventName: "VoucherClaimed",
    indexedNames: ["claimId", "wallet"],
    kinds: ["FUSD"],
    signature: "VoucherClaimed(bytes32,address,uint256,uint256)",
  }),
  define({
    eventName: "ConditionPreparation",
    indexedNames: ["conditionId", "oracle", "questionId"],
    kinds: ["CTF"],
    signature: "ConditionPreparation(bytes32,address,bytes32,uint256)",
  }),
  define({
    eventName: "ConditionResolution",
    indexedNames: ["conditionId", "oracle", "questionId"],
    kinds: ["CTF"],
    signature: "ConditionResolution(bytes32,address,bytes32,uint256,uint256[])",
  }),
  define({
    eventName: "PositionSplit",
    indexedNames: ["stakeholder", "parentCollectionId", "conditionId"],
    kinds: ["CTF"],
    signature: "PositionSplit(address,address,bytes32,bytes32,uint256[],uint256)",
  }),
  define({
    eventName: "PositionsMerge",
    indexedNames: ["stakeholder", "parentCollectionId", "conditionId"],
    kinds: ["CTF"],
    signature: "PositionsMerge(address,address,bytes32,bytes32,uint256[],uint256)",
  }),
  define({
    eventName: "PayoutRedemption",
    indexedNames: ["redeemer", "collateralToken", "parentCollectionId"],
    kinds: ["CTF"],
    signature: "PayoutRedemption(address,address,bytes32,bytes32,uint256[],uint256)",
  }),
  define({
    eventName: "TransferSingle",
    indexedNames: ["operator", "from", "to"],
    kinds: ["CTF"],
    signature: "TransferSingle(address,address,address,uint256,uint256)",
  }),
  define({
    eventName: "TransferBatch",
    indexedNames: ["operator", "from", "to"],
    kinds: ["CTF"],
    signature: "TransferBatch(address,address,address,uint256[],uint256[])",
  }),
  define({
    eventName: "ApprovalForAll",
    indexedNames: ["owner", "operator"],
    kinds: ["CTF"],
    signature: "ApprovalForAll(address,address,bool)",
  }),
  define({
    eventName: "URI",
    indexedNames: ["id"],
    kinds: ["CTF"],
    signature: "URI(string,uint256)",
  }),
] as const satisfies readonly ProjectEventDefinition[];

const definitionsByName = new Map(
  PROJECT_EVENT_DEFINITIONS.map((definition) => [
    definition.eventName,
    definition,
  ]),
);

export function getProjectEventDefinition(
  eventName: string,
  kind: ProjectContractKind,
  topic0: Hex | undefined,
): ProjectEventDefinition {
  const definition = definitionsByName.get(eventName);
  if (
    !definition ||
    !definition.kinds.includes(kind) ||
    topic0?.toLowerCase() !== definition.topic0.toLowerCase()
  ) {
    throw new Error(
      `Event ${eventName} is not registered for ${kind} with topic ${topic0 ?? "none"}`,
    );
  }

  return definition;
}
