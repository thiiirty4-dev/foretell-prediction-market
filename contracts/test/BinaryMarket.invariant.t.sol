// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BinaryMarket} from "../src/BinaryMarket.sol";
import {IConditionalTokens} from "../src/IConditionalTokens.sol";

/// @notice Arithmetic properties shared by the production binary FPMM.
/// @dev This file intentionally has no forge-std dependency, so solc and Foundry
///      can both compile it. Foundry treats external test functions with inputs as
///      fuzz tests.
contract BinaryMarketInvariantTest {
    uint256 private constant MAX_RESERVE = type(uint120).max;

    function testRedemptionSurfaceSeparatesUsersFromLiquidityProvider() external pure {
        require(
            BinaryMarket.redeemLiquidity.selector == bytes4(keccak256("redeemLiquidity()")),
            "unexpected LP redemption selector"
        );
        require(
            BinaryMarket.redeemLiquidity.selector != IConditionalTokens.redeemPositions.selector,
            "market must not impersonate user redemption"
        );
    }

    function testFuzzBuyRoundingCannotDecreaseProduct(
        uint120 rawYesReserve,
        uint120 rawNoReserve,
        uint120 rawInvestment,
        bool buyYes
    ) external pure {
        uint256 yesReserve = (uint256(rawYesReserve) % MAX_RESERVE) + 1;
        uint256 noReserve = (uint256(rawNoReserve) % MAX_RESERVE) + 1;
        uint256 room = MAX_RESERVE - _max(yesReserve, noReserve);
        if (room == 0) return;

        uint256 investment = (uint256(rawInvestment) % room) + 1;
        uint256 productBefore = yesReserve * noReserve;
        uint256 yesAfterSplit = yesReserve + investment;
        uint256 noAfterSplit = noReserve + investment;

        uint256 finalYes;
        uint256 finalNo;
        if (buyYes) {
            finalYes = _ceilDiv(productBefore, noAfterSplit);
            finalNo = noAfterSplit;
            require(finalYes <= yesAfterSplit, "invalid YES output");
        } else {
            finalYes = yesAfterSplit;
            finalNo = _ceilDiv(productBefore, yesAfterSplit);
            require(finalNo <= noAfterSplit, "invalid NO output");
        }

        require(finalYes * finalNo >= productBefore, "buy decreased product");
    }

    function testFuzzSellRoundingCannotDecreaseProduct(
        uint120 rawSelectedReserve,
        uint120 rawOtherReserve,
        uint120 rawTokensIn
    ) external pure {
        uint256 selectedReserve = (uint256(rawSelectedReserve) % MAX_RESERVE) + 1;
        uint256 otherReserve = (uint256(rawOtherReserve) % MAX_RESERVE) + 1;
        uint256 room = MAX_RESERVE - selectedReserve;
        if (room == 0) return;

        uint256 tokensIn = (uint256(rawTokensIn) % room) + 1;
        uint256 sum = selectedReserve + otherReserve + tokensIn;
        uint256 radicand = (sum * sum) - (4 * tokensIn * otherReserve);
        uint256 root = _sqrt(radicand);
        if (root * root < radicand) root += 1;

        uint256 collateralOut = (sum - root) / 2;
        require(collateralOut < otherReserve, "sell exhausted opposite reserve");

        uint256 finalSelected = selectedReserve + tokensIn - collateralOut;
        uint256 finalOther = otherReserve - collateralOut;
        require(finalSelected * finalOther >= selectedReserve * otherReserve, "sell decreased product");
    }

    function testCancellationRoundingIsBoundedPerRedeemer(uint120 yesBalance, uint120 noBalance) external pure {
        uint256 combined = uint256(yesBalance) + uint256(noBalance);
        uint256 payout = combined / 2;
        require(combined - (payout * 2) <= 1, "rounding residue exceeded one unit");
    }

    function _ceilDiv(uint256 numerator, uint256 denominator) private pure returns (uint256) {
        return numerator == 0 ? 0 : ((numerator - 1) / denominator) + 1;
    }

    function _max(uint256 a, uint256 b) private pure returns (uint256) {
        return a > b ? a : b;
    }

    function _sqrt(uint256 value) private pure returns (uint256 result) {
        if (value == 0) return 0;
        result = 1 << (_log2(value) >> 1);
        unchecked {
            for (uint256 i; i < 7; ++i) {
                result = (result + value / result) >> 1;
            }
            return _min(result, value / result);
        }
    }

    function _log2(uint256 value) private pure returns (uint256 result) {
        unchecked {
            if (value >> 128 > 0) {
                value >>= 128;
                result += 128;
            }
            if (value >> 64 > 0) {
                value >>= 64;
                result += 64;
            }
            if (value >> 32 > 0) {
                value >>= 32;
                result += 32;
            }
            if (value >> 16 > 0) {
                value >>= 16;
                result += 16;
            }
            if (value >> 8 > 0) {
                value >>= 8;
                result += 8;
            }
            if (value >> 4 > 0) {
                value >>= 4;
                result += 4;
            }
            if (value >> 2 > 0) {
                value >>= 2;
                result += 2;
            }
            if (value >> 1 > 0) result += 1;
        }
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
