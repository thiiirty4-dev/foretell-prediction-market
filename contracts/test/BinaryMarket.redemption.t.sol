// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BinaryMarket} from "../src/BinaryMarket.sol";
import {IConditionalTokens} from "../src/IConditionalTokens.sol";
import {MockCollateral} from "./mocks/MockCollateral.sol";
import {MockConditionalTokens} from "./mocks/MockConditionalTokens.sol";

interface Vm {
    function warp(uint256 timestamp) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
}

contract BinaryMarketRedemptionTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant INITIAL_LIQUIDITY = 1_000e6;
    uint256 private constant TRADER_BALANCE = 2_000e6;

    address private constant LP = address(0x1001);
    address private constant TRADER = address(0x1002);
    address private constant CHALLENGER = address(0x1003);
    address private constant RESOLVER = address(0x1004);
    address private constant ADMIN = address(0x1005);
    address private constant TREASURY = address(0x1006);

    MockCollateral private collateral;
    MockConditionalTokens private ctf;
    BinaryMarket private market;
    uint64 private closesAt;

    function setUp() external {
        collateral = new MockCollateral();
        ctf = new MockConditionalTokens();
        closesAt = uint64(block.timestamp + 2 days);
        market = new BinaryMarket(
            collateral,
            IConditionalTokens(address(ctf)),
            RESOLVER,
            ADMIN,
            TREASURY,
            keccak256("question"),
            keccak256("metadata"),
            "https://example.invalid/market.json",
            closesAt
        );

        collateral.mint(address(this), INITIAL_LIQUIDITY);
        collateral.transfer(address(market), INITIAL_LIQUIDITY);
        market.initializeLiquidity(LP, INITIAL_LIQUIDITY);
        collateral.mint(TRADER, TRADER_BALANCE);
        collateral.mint(CHALLENGER, market.CHALLENGE_BOND());

        vm.startPrank(TRADER);
        collateral.approve(address(market), type(uint256).max);
        ctf.setApprovalForAll(address(market), true);
        vm.stopPrank();

        vm.prank(CHALLENGER);
        collateral.approve(address(market), type(uint256).max);
    }

    function testUserRedeemsDirectlyAndLpCannotSweepUserPosition() external {
        uint256 userShares = _buyYes(100e6);
        uint256 lpYesBefore = market.yesReserve();
        uint256 lpNoBefore = market.noReserve();
        _resolveYes();

        uint256 userCollateralBefore = collateral.balanceOf(TRADER);
        bytes32 condition = market.conditionId();
        uint256[] memory partition = _partition();
        vm.prank(TRADER);
        ctf.redeemPositions(address(collateral), bytes32(0), condition, partition);
        require(collateral.balanceOf(TRADER) - userCollateralBefore == userShares, "wrong user payout");
        require(market.yesReserve() == lpYesBefore && market.noReserve() == lpNoBefore, "user touched LP reserves");

        uint256 lpCollateralBefore = collateral.balanceOf(LP);
        vm.prank(LP);
        uint256 lpPayout = market.redeemLiquidity();
        require(collateral.balanceOf(LP) - lpCollateralBefore == lpPayout, "wrong LP payout");
        require(lpPayout == lpYesBefore, "LP swept more than winning reserve");
        require(market.yesReserve() == 0 && market.noReserve() == 0, "reserves not consumed");
        require(market.invariantsHold(), "post-redemption invariant failed");
    }

    function testOnlyLpCanRedeemAndRedemptionIsSingleUse() external {
        _buyYes(50e6);
        _resolveYes();

        vm.prank(TRADER);
        (bool unauthorized,) = address(market).call(abi.encodeWithSelector(BinaryMarket.redeemLiquidity.selector));
        require(!unauthorized, "non-LP redeemed liquidity");

        vm.prank(LP);
        market.redeemLiquidity();
        vm.prank(LP);
        (bool repeated,) = address(market).call(abi.encodeWithSelector(BinaryMarket.redeemLiquidity.selector));
        require(!repeated, "liquidity redeemed twice");
    }

    function testDirectPositionDonationCannotDesynchronizeReserves() external {
        uint256 userShares = _buyYes(50e6);
        uint256 positionId = market.yesPositionId();
        bytes memory transferCall = abi.encodeWithSelector(
            ctf.safeTransferFrom.selector, TRADER, address(market), positionId, userShares, bytes("")
        );
        vm.prank(TRADER);
        (bool donated,) = address(ctf).call(transferCall);
        require(!donated, "unaccounted position donation accepted");
        require(market.invariantsHold(), "donation changed backing");
    }

    function testCancellationDustIsBoundedAndRemainsAuditableInCtf() external {
        _buyYes(101e6 + 1);
        vm.warp(closesAt);
        vm.prank(RESOLVER);
        market.propose(BinaryMarket.Outcome.YES, keccak256("evidence"));
        vm.prank(CHALLENGER);
        market.challenge(keccak256("reason"));
        vm.prank(ADMIN);
        market.decideDispute(0);

        uint256 locked = market.openCollateral();
        uint256 userYes = ctf.balanceOf(TRADER, market.yesPositionId());
        uint256 userNo = ctf.balanceOf(TRADER, market.noPositionId());
        uint256 lpYes = market.yesReserve();
        uint256 lpNo = market.noReserve();
        uint256 expectedUser = (userYes + userNo) / 2;
        uint256 expectedLp = (lpYes + lpNo) / 2;
        uint256 expectedDust = locked - expectedUser - expectedLp;

        uint256 userBefore = collateral.balanceOf(TRADER);
        bytes32 condition = market.conditionId();
        uint256[] memory partition = _partition();
        vm.prank(TRADER);
        ctf.redeemPositions(address(collateral), bytes32(0), condition, partition);
        require(collateral.balanceOf(TRADER) - userBefore == expectedUser, "wrong cancellation user payout");

        vm.prank(LP);
        uint256 actualLp = market.redeemLiquidity();
        require(actualLp == expectedLp, "wrong cancellation LP payout");
        require(collateral.balanceOf(address(ctf)) == expectedDust, "cancellation dust mismatch");
        require(expectedDust <= 1, "excess cancellation dust");
    }

    function testBuyAndSellKeepExactReserveBacking() external {
        uint256 shares = _buyYes(100e6);
        require(market.invariantsHold(), "buy invariant failed");
        vm.prank(TRADER);
        market.sell(0, shares / 2, 0, block.timestamp + 1 hours);
        require(market.invariantsHold(), "sell invariant failed");
    }

    function _buyYes(uint256 amount) private returns (uint256 shares) {
        vm.prank(TRADER);
        shares = market.buy(0, amount, 0, block.timestamp + 1 hours);
    }

    function _resolveYes() private {
        vm.warp(closesAt);
        vm.prank(RESOLVER);
        market.propose(BinaryMarket.Outcome.YES, keccak256("evidence"));
        vm.warp(block.timestamp + 1 days + 1);
        market.finalizeUnchallenged();
    }

    function _partition() private pure returns (uint256[] memory partition) {
        partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;
    }
}
