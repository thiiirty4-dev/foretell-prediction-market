import { describe, expect, it } from "vitest";

const UNIT = 1_000_000n;
const BPS = 10_000n;
const FEE_BPS = 100n;

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return numerator === 0n ? 0n : (numerator - 1n) / denominator + 1n;
}

function sqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("negative square root");
  if (value < 2n) return value;

  let current = 1n << BigInt((value.toString(2).length + 1) >> 1);
  let next = (current + value / current) >> 1n;
  while (next < current) {
    current = next;
    next = (current + value / current) >> 1n;
  }
  return current;
}

function sellCollateralOut(
  selectedReserve: bigint,
  otherReserve: bigint,
  tokensIn: bigint,
): bigint {
  const sum = selectedReserve + otherReserve + tokensIn;
  const radicand = sum * sum - 4n * tokensIn * otherReserve;
  const floorRoot = sqrt(radicand);
  const ceilRoot = floorRoot * floorRoot === radicand ? floorRoot : floorRoot + 1n;
  return (sum - ceilRoot) / 2n;
}

describe("binary market asset accounting", () => {
  it("preserves collateral, complete-set backing, and k across mixed trades", () => {
    const initialLiquidity = 1_000n * UNIT;
    const totalSupply = 10_000n * UNIT;
    let wallet = totalSupply - initialLiquidity;
    let treasury = 0n;
    let lockedCollateral = initialLiquidity;
    let reserveYes = initialLiquidity;
    let reserveNo = initialLiquidity;
    let userYes = 0n;
    let userNo = 0n;

    let seed = 0x9e3779b9n;
    const random = (max: bigint) => {
      seed = (seed * 1_664_525n + 1_013_904_223n) & 0xffff_ffffn;
      return max === 0n ? 0n : seed % max;
    };

    for (let step = 0; step < 500; step += 1) {
      const yes = (random(2n) & 1n) === 0n;
      const shouldBuy = (yes ? userYes : userNo) < UNIT || random(3n) !== 0n;
      const productBefore = reserveYes * reserveNo;

      if (shouldBuy && wallet > UNIT) {
        const gross = 1n + random(wallet < 25n * UNIT ? wallet : 25n * UNIT);
        const fee = (gross * FEE_BPS) / BPS;
        const investment = gross - fee;
        if (investment === 0n) continue;

        wallet -= gross;
        treasury += fee;
        lockedCollateral += investment;
        reserveYes += investment;
        reserveNo += investment;

        if (yes) {
          const finalReserve = ceilDiv(productBefore, reserveNo);
          const tokensOut = reserveYes - finalReserve;
          reserveYes = finalReserve;
          userYes += tokensOut;
        } else {
          const finalReserve = ceilDiv(productBefore, reserveYes);
          const tokensOut = reserveNo - finalReserve;
          reserveNo = finalReserve;
          userNo += tokensOut;
        }
      } else {
        const available = yes ? userYes : userNo;
        if (available === 0n) continue;
        const tokensIn = 1n + random(available);
        const selected = yes ? reserveYes : reserveNo;
        const other = yes ? reserveNo : reserveYes;
        const grossOut = sellCollateralOut(selected, other, tokensIn);
        if (grossOut === 0n || grossOut >= other) continue;

        const fee = (grossOut * FEE_BPS) / BPS;
        wallet += grossOut - fee;
        treasury += fee;
        lockedCollateral -= grossOut;

        if (yes) {
          userYes -= tokensIn;
          reserveYes = reserveYes + tokensIn - grossOut;
          reserveNo -= grossOut;
        } else {
          userNo -= tokensIn;
          reserveNo = reserveNo + tokensIn - grossOut;
          reserveYes -= grossOut;
        }
      }

      expect(reserveYes * reserveNo).toBeGreaterThanOrEqual(productBefore);
      expect(reserveYes + userYes).toBe(lockedCollateral);
      expect(reserveNo + userNo).toBe(lockedCollateral);
      expect(wallet + treasury + lockedCollateral).toBe(totalSupply);
    }
  });

  it("keeps user redemption separate from the LP and accounts for cancellation dust", () => {
    const lockedCollateral = 2_000_000_003n;
    const userYes = 700_000_001n;
    const userNo = 200_000_000n;
    const lpYes = lockedCollateral - userYes;
    const lpNo = lockedCollateral - userNo;

    const userPayout = (userYes + userNo) / 2n;
    const lpPayout = (lpYes + lpNo) / 2n;
    const roundingDust = lockedCollateral - userPayout - lpPayout;

    expect(userPayout).toBe(450_000_000n);
    expect(roundingDust).toBeGreaterThanOrEqual(0n);
    expect(roundingDust).toBeLessThanOrEqual(1n);
    expect(userPayout + lpPayout + roundingDust).toBe(lockedCollateral);
  });

  it("keeps challenge bonds collateralized until refund or forfeiture", () => {
    const totalSupply = 10_000n * UNIT;
    let wallet = totalSupply;
    let escrow = 0n;
    let treasury = 0n;
    const bond = 100n * UNIT;

    wallet -= bond;
    escrow += bond;
    expect(wallet + escrow + treasury).toBe(totalSupply);

    escrow -= bond;
    wallet += bond;
    expect(wallet + escrow + treasury).toBe(totalSupply);

    wallet -= bond;
    escrow += bond;
    escrow -= bond;
    treasury += bond;
    expect(wallet + escrow + treasury).toBe(totalSupply);
  });
});
