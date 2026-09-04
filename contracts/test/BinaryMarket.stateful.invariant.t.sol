// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BinaryMarket} from "../src/BinaryMarket.sol";
import {IConditionalTokens} from "../src/IConditionalTokens.sol";
import {MockCollateral} from "./mocks/MockCollateral.sol";
import {MockConditionalTokens} from "./mocks/MockConditionalTokens.sol";

abstract contract InvariantTarget {
    struct FuzzSelector {
        address addr;
        bytes4[] selectors;
    }

    struct FuzzArtifactSelector {
        string artifact;
        bytes4[] selectors;
    }

    struct FuzzInterface {
        address addr;
        string[] artifacts;
    }

    address[] private targeted;

    function targetContract(address target) internal {
        targeted.push(target);
    }

    function targetContracts() public view returns (address[] memory) {
        return targeted;
    }

    function excludeArtifacts() public pure returns (string[] memory values) {
        values = new string[](0);
    }

    function targetArtifacts() public pure returns (string[] memory values) {
        values = new string[](0);
    }

    function excludeContracts() public pure returns (address[] memory values) {
        values = new address[](0);
    }

    function excludeSenders() public pure returns (address[] memory values) {
        values = new address[](0);
    }

    function targetSenders() public pure returns (address[] memory values) {
        values = new address[](0);
    }

    function excludeSelectors() public pure returns (FuzzSelector[] memory values) {
        values = new FuzzSelector[](0);
    }

    function targetSelectors() public pure returns (FuzzSelector[] memory values) {
        values = new FuzzSelector[](0);
    }

    function targetArtifactSelectors() public pure returns (FuzzArtifactSelector[] memory values) {
        values = new FuzzArtifactSelector[](0);
    }

    function targetInterfaces() public pure returns (FuzzInterface[] memory values) {
        values = new FuzzInterface[](0);
    }
}

contract BinaryMarketHandler {
    uint256 private constant MAX_TRADE = 25e6;

    BinaryMarket private immutable market;
    MockCollateral private immutable collateral;
    MockConditionalTokens private immutable ctf;
    uint256 private lastProduct;
    bool private productMonotonic = true;

    constructor(BinaryMarket market_, MockCollateral collateral_, MockConditionalTokens ctf_) {
        market = market_;
        collateral = collateral_;
        ctf = ctf_;
        collateral_.approve(address(market_), type(uint256).max);
        ctf_.setApprovalForAll(address(market_), true);
        lastProduct = market_.yesReserve() * market_.noReserve();
    }

    function buyYes(uint96 rawAmount) external {
        _buy(0, rawAmount);
    }

    function buyNo(uint96 rawAmount) external {
        _buy(1, rawAmount);
    }

    function sellYes(uint96 rawAmount) external {
        _sell(0, rawAmount);
    }

    function sellNo(uint96 rawAmount) external {
        _sell(1, rawAmount);
    }

    function productNeverDecreased() external view returns (bool) {
        return productMonotonic;
    }

    function _buy(uint8 side, uint96 rawAmount) private {
        uint256 walletBalance = collateral.balanceOf(address(this));
        if (walletBalance == 0) return;
        uint256 cap = walletBalance < MAX_TRADE ? walletBalance : MAX_TRADE;
        uint256 amount = 1 + (uint256(rawAmount) % cap);

        try market.buy(side, amount, 0, block.timestamp + 1 hours) {
            _recordProduct();
        } catch {}
    }

    function _sell(uint8 side, uint96 rawAmount) private {
        uint256 positionId = side == 0 ? market.yesPositionId() : market.noPositionId();
        uint256 available = ctf.balanceOf(address(this), positionId);
        if (available == 0) return;
        uint256 amount = 1 + (uint256(rawAmount) % available);

        try market.sell(side, amount, 0, block.timestamp + 1 hours) {
            _recordProduct();
        } catch {}
    }

    function _recordProduct() private {
        uint256 currentProduct = market.yesReserve() * market.noReserve();
        if (currentProduct < lastProduct) productMonotonic = false;
        lastProduct = currentProduct;
    }
}

contract BinaryMarketStatefulInvariantTest is InvariantTarget {
    uint256 private constant INITIAL_LIQUIDITY = 1_000e6;
    uint256 private constant TRADER_FUNDS = 1_000_000e6;
    address private constant LP = address(0x2001);
    address private constant RESOLVER = address(0x2002);
    address private constant ADMIN = address(0x2003);
    address private constant TREASURY = address(0x2004);

    MockCollateral private collateral;
    MockConditionalTokens private ctf;
    BinaryMarket private market;
    BinaryMarketHandler private handler;

    function setUp() external {
        collateral = new MockCollateral();
        ctf = new MockConditionalTokens();
        market = new BinaryMarket(
            collateral,
            IConditionalTokens(address(ctf)),
            RESOLVER,
            ADMIN,
            TREASURY,
            keccak256("stateful-question"),
            keccak256("stateful-metadata"),
            "https://example.invalid/stateful-market.json",
            uint64(block.timestamp + 365 days)
        );

        collateral.mint(address(this), INITIAL_LIQUIDITY);
        collateral.transfer(address(market), INITIAL_LIQUIDITY);
        market.initializeLiquidity(LP, INITIAL_LIQUIDITY);

        handler = new BinaryMarketHandler(market, collateral, ctf);
        collateral.mint(address(handler), TRADER_FUNDS);
        targetContract(address(handler));
    }

    function invariantMarketReportsHealthyBacking() external view {
        require(market.invariantsHold(), "market invariant helper failed");
    }

    function invariantReservesAreExactlyBacked() external view {
        require(
            ctf.balanceOf(address(market), market.yesPositionId()) == market.yesReserve(), "YES reserve is not backed"
        );
        require(ctf.balanceOf(address(market), market.noPositionId()) == market.noReserve(), "NO reserve is not backed");
    }

    function invariantCompleteSetsMatchOpenCollateral() external view {
        uint256 yesSupply = market.yesReserve() + ctf.balanceOf(address(handler), market.yesPositionId());
        uint256 noSupply = market.noReserve() + ctf.balanceOf(address(handler), market.noPositionId());
        require(yesSupply == market.openCollateral(), "YES complete-set mismatch");
        require(noSupply == market.openCollateral(), "NO complete-set mismatch");
        require(collateral.balanceOf(address(ctf)) == market.openCollateral(), "CTF collateral mismatch");
    }

    function invariantCollateralIsConserved() external view {
        uint256 accounted = collateral.balanceOf(address(this)) + collateral.balanceOf(address(handler))
            + collateral.balanceOf(address(market)) + collateral.balanceOf(address(ctf))
            + collateral.balanceOf(TREASURY) + collateral.balanceOf(LP);
        require(accounted == collateral.totalSupply(), "collateral escaped accounting");
    }

    function invariantConstantProductNeverDecreases() external view {
        require(handler.productNeverDecreased(), "constant product decreased");
    }
}
