# Polygon Amoy event matrix

This matrix is generated from the local Foundry artifacts for project
contracts. Conditional Tokens events follow the Gnosis Conditional Tokens
implementation used by the project.

| Contract | Event | Projection |
| --- | --- | --- |
| MarketFactory | `MarketCreated` | Market contract registration and `MARKET_CREATED` |
| BinaryMarket | `LiquidityInitialized` | Reserves, initial probability, `LIQUIDITY_CHANGED` |
| BinaryMarket | `Trade` | Trade, probability, reserves, order fill |
| BinaryMarket | `ResolutionProposed` | `PROPOSED` market state and settlement audit |
| BinaryMarket | `Challenged` | `DISPUTED` market state and settlement audit |
| BinaryMarket | `Finalized` | `RESOLVED` or `CANCELLED` market state |
| BinaryMarket | `CancellationRoundingPolicy` | Cancellation accounting audit |
| BinaryMarket | `LiquidityRedeemed` | Liquidity redemption audit |
| ForecastTestUSD | `VoucherClaimed` | Test-asset issuance audit |
| ForecastTestUSD | `Transfer` | Test-asset transfer audit |
| Conditional Tokens | `ConditionPreparation` | Condition-to-market binding |
| Conditional Tokens | `ConditionResolution` | Payout-vector settlement audit |
| Conditional Tokens | `PositionSplit` | Position activity audit |
| Conditional Tokens | `PositionsMerge` | Position activity audit |
| Conditional Tokens | `PayoutRedemption` | Position redemption audit |
| Conditional Tokens | ERC-1155 transfer events | Raw position-token activity |

## Events not present

`OrderCreated` and `OrderCancelled` are not emitted because the current market
uses immediate FPMM execution rather than an on-chain order book. A submitted
database order becomes filled only after a matching confirmed `Trade` event.

There is no explicit `MarketClosed` event. The read model derives `CLOSED` from
the immutable close time and the timestamp of a confirmed block.

There is no standalone probability event. Probability is derived with integer
arithmetic from reserves carried by `LiquidityInitialized` and `Trade`.
