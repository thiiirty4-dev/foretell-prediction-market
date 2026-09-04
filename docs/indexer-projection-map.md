# Polygon Amoy event projection map

This document records the event surface actually accepted by the indexer. It
does not invent order events: `OrderCreated` and `OrderCancelled` do not exist
in the current Solidity contracts. Every accepted log is decoded using the
exact ABI in `worker/contract-events.ts`.

## Identities and replay rules

- Raw inclusion identity: `(chain_id, transaction_hash, log_index, block_hash)`.
- Canonicality is append-only in `chain_event_canonicality`; inclusions are
  never deleted or overwritten.
- Standard projection identity adds `(projection_type, projector_version)`.
  The current view selects the highest projector version for each inclusion
  and projection type.
- A confirmed replay is idempotent. A reorg appends `canonical=false`, marks
  mutable read models orphaned, rewinds the checkpoint, and rebuilds current
  values from canonical inclusions.
- All token and share quantities are unsigned integer smallest units. Prices
  are integer basis points. No floating-point accounting is used.

## Event to projection mapping

| Event | Source | Required decoded fields | Database writes | Projection/invariant | Reorg and canonical behavior |
| --- | --- | --- | --- | --- | --- |
| `MarketCreated` | `MarketFactory` | `market`, `creator`, `metadataHash`, `metadataURI`, `closeTime`, `mechanismVersion` | `markets`, `indexer_contract_registry`, `indexed_market_events` | Must match exactly one reviewed CHAIN market and immutable metadata; creates `MARKET_CREATED/OPEN` | Creation becomes non-canonical; discovered contract is disabled and market is hidden until replay |
| `LiquidityInitialized` | `BinaryMarket` | `creator`, `collateralAmount`, `yesReserve`, `noReserve` | `market_reserves`, `probability_history`, `markets`, `indexed_market_events` | Reserves and amount are non-negative integers; YES bps is derived from opposing reserve; creates liquidity and probability projections | Reserve/probability rows are rebuilt from latest canonical market event |
| `Trade` | `BinaryMarket` | `trader`, `side`, `isBuy`, `collateralAmount`, `shareAmount`, `feeAmount`, `yesReserve`, `noReserve` | `trades`, `market_reserves`, `probability_history`, `markets`, `orders`, both order history tables, `indexer_transaction_observations`, `transaction_receipts`, `indexed_market_events` | Positive collateral/shares, non-negative fee/reserves, side 0/1; volume is the sum of canonical `collateral_amount`; matching order must agree on market, wallet, side, operation and exact amount | Trade/probability become orphaned; receipt gets an append-only non-canonical observation; order becomes REORGED/ORPHANED; aggregate is rebuilt |
| `ResolutionProposed` | `BinaryMarket` | `outcome`, `evidenceHash`, `challengeDeadline` | `markets`, `indexed_market_events` | Outcome is uint8 and constrained to 0..2 in the projection | Status is rebuilt from latest canonical status projection |
| `Challenged` | `BinaryMarket` | `challenger`, `bond`, `reasonHash` | `markets`, `indexed_market_events` | Bond is an unsigned exact integer; this is chain evidence, not yet a materialized `challenges` row | DISPUTED status disappears on orphaning and is rebuilt |
| `Finalized` | `BinaryMarket` | `finalOutcome`, `cancelled` | `markets`, `indexed_market_events` | Final outcome is 0..2; cancelled selects `CANCELLED`, otherwise `RESOLVED` | Status is rebuilt from canonical settlement events |
| `CancellationRoundingPolicy` | `BinaryMarket` | `denominator`, `accountingUnit` | `indexed_market_events` | Audit-only settlement detail; denominator is an unsigned integer | Current view excludes orphaned inclusion |
| `LiquidityRedeemed` | `BinaryMarket` | `provider`, `collateralAmount` | `market_reserves`, `markets`, `indexed_market_events` | AMM reserves become exactly zero; emits redemption and liquidity projections | Rebuild restores the previous canonical reserve event if redemption is orphaned |
| `ConditionPreparation` | Gnosis CTF | `conditionId`, `oracle`, `questionId`, `outcomeSlotCount` | `markets`, `market_outcomes`, `indexed_market_events` | Projected only when oracle is a registered market; slot count must equal 2 | Condition and market projections replay with the market creation transaction |
| `ConditionResolution` | Gnosis CTF | `conditionId`, `oracle`, `questionId`, `outcomeSlotCount`, `payoutNumerators` | `market_outcomes`, `indexed_market_events` | Known project condition only; exactly two non-negative numerators with positive denominator | YES/NO payout numerators are rebuilt from latest canonical resolution or reset to NULL |
| `PositionSplit` | Gnosis CTF | `stakeholder`, `collateralToken`, `parentCollectionId`, `conditionId`, `partition`, `amount` | `indexed_market_events` | Known project condition and configured fUSD collateral only; audit projection, not a balance update | Current view excludes orphaned inclusion |
| `PositionsMerge` | Gnosis CTF | same as `PositionSplit` | `indexed_market_events` | Same filter and integer invariant; audit projection only | Current view excludes orphaned inclusion |
| `PayoutRedemption` | Gnosis CTF | `redeemer`, `collateralToken`, `parentCollectionId`, `conditionId`, `indexSets`, `payout` | `indexed_market_events` | Known project condition and configured fUSD only; payout non-negative; no position/balance mutation is inferred | Current view excludes orphaned inclusion |
| `TransferSingle` | Gnosis CTF ERC-1155 | `operator`, `from`, `to`, `id`, `value` | raw inclusion only | No position projection until `position_id -> market/outcome` mapping is populated and tested | Canonicality remains fully auditable in raw inclusion history |
| `TransferBatch` | Gnosis CTF ERC-1155 | `operator`, `from`, `to`, `ids`, `values` | raw inclusion only | Raw-only because one event can span multiple positions and markets | Canonicality remains fully auditable in raw inclusion history |
| `ApprovalForAll` | Gnosis CTF ERC-1155 | `owner`, `operator`, `approved` | raw inclusion only | Authorization event; no accounting effect | Append-only canonicality |
| `URI` | Gnosis CTF ERC-1155 | `value`, `id` | raw inclusion only | Metadata event; no accounting effect | Append-only canonicality |
| `VoucherClaimed` | `ForecastTestUSD` | `claimId`, `wallet`, `amount`, `nonce` | `indexed_market_events` | Asset audit event with unsigned amount; does not directly mutate `asset_balances` | Current view excludes orphaned inclusion |
| `Transfer` | `ForecastTestUSD` | `from`, `to`, `value` | `indexed_market_events` | Asset audit event; no inferred balance until complete replay projection is implemented | Current view excludes orphaned inclusion |
| `Approval` | `ForecastTestUSD` | `owner`, `spender`, `value` | raw inclusion only | Allowance event; no balance effect | Append-only canonicality |
| `EIP712DomainChanged` | Factory or fUSD | none | raw inclusion only | Administrative audit event | Append-only canonicality |
| `RoleAdminChanged` | Factory or fUSD | `role`, `previousAdminRole`, `newAdminRole` | raw inclusion only | Administrative audit event | Append-only canonicality |
| `RoleGranted` | Factory or fUSD | `role`, `account`, `sender` | raw inclusion only | Administrative audit event | Append-only canonicality |
| `RoleRevoked` | Factory or fUSD | `role`, `account`, `sender` | raw inclusion only | Administrative audit event | Append-only canonicality |

## Deliberately unmaterialized projections

- `asset_balances` is not updated yet. A correct implementation must replay all
  fUSD `Transfer` events, including mint and burn zero-address semantics, and
  rebuild after reorg. Voucher events alone are insufficient.
- `positions` is not updated yet. It requires populated and verified
  `market_outcomes.position_id` values and atomic expansion of ERC-1155 batch
  transfers. Trade events alone are insufficient because positions are freely
  transferable and directly redeemable through CTF.
- `challenges` and `resolution_evidence` remain application intent records.
  Chain truth is currently preserved in standardized settlement events, but a
  canonical materialized link to intent records is not implemented.
- Failed transactions emit no contract logs. The current receipt projection
  proves successful Trade transactions only; a separate read-only receipt
  poller is still required to resolve failed, dropped, and replaced orders.
