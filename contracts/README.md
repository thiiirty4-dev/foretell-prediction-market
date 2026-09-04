# Contracts

Install pinned dependencies before compiling:

```bash
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-commit
forge install foundry-rs/forge-std@v1.10.0 --no-commit
forge test
```

`BinaryMarket` is an independently implemented binary constant-product FPMM. It compiles against a minimal interface because the canonical Gnosis Conditional Tokens deployment uses an older Solidity compiler. Integration must use canonical Gnosis bytecode and retain its LGPL-3.0 notice.

Users redeem their own outcome positions directly through Conditional Tokens. Only the original liquidity provider can call `redeemLiquidity`, which burns AMM-owned reserves and transfers exactly the collateral produced by that call. Recorded reserves must equal the market's ERC-1155 balances, direct token donations are rejected, reserve math is bounded, constant-product value cannot decrease through rounding, challenge escrow stays collateralized, and LP redemption is single-use.

Deployment scripts must only simulate unless a separately approved broadcast flag is supplied.
