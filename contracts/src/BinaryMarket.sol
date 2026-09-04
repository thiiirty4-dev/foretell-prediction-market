// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IConditionalTokens} from "./IConditionalTokens.sol";

/// @notice Immutable binary constant-product market backed by Gnosis Conditional Tokens.
/// @dev Users redeem directly on `ctf`; this contract only redeems AMM reserves for the LP.
contract BinaryMarket is IERC1155Receiver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        OPEN,
        PROPOSED,
        DISPUTED,
        RESOLVED,
        CANCELLED
    }
    enum Outcome {
        YES,
        NO
    }

    uint16 public constant FEE_BPS = 100;
    uint256 public constant CHALLENGE_BOND = 100e6;
    uint256 public constant MAX_OPEN_COLLATERAL = type(uint120).max;

    IERC20 public immutable collateral;
    IConditionalTokens public immutable ctf;
    address public immutable resolver;
    address public immutable resolutionAdmin;
    address public immutable treasury;
    address public immutable factory;
    bytes32 public immutable questionId;
    bytes32 public immutable conditionId;
    bytes32 public immutable metadataHash;
    uint64 public immutable closeTime;
    uint256 public immutable yesPositionId;
    uint256 public immutable noPositionId;

    string public metadataURI;
    address public liquidityProvider;
    uint256 public yesReserve;
    uint256 public noReserve;
    uint256 public openCollateral;
    uint256 public challengeEscrow;
    State public state;
    Outcome public proposedOutcome;
    uint64 public proposedAt;
    address public challenger;
    bytes32 public evidenceHash;
    bool public liquidityRedeemed;

    error Unauthorized();
    error InvalidState();
    error Closed();
    error DeadlineExpired();
    error Slippage();
    error InvalidAmount();
    error ChallengeWindowOpen();
    error ChallengeWindowClosed();
    error UnsupportedPositionTransfer();
    error ReserveLimitExceeded();
    error ReserveInvariantViolation(uint256 expectedYes, uint256 actualYes, uint256 expectedNo, uint256 actualNo);
    error CollateralInvariantViolation(uint256 expectedMinimum, uint256 actual);

    event LiquidityInitialized(
        address indexed creator, uint256 collateralAmount, uint256 yesReserve, uint256 noReserve
    );
    event Trade(
        address indexed trader,
        uint8 indexed side,
        bool isBuy,
        uint256 collateralAmount,
        uint256 shareAmount,
        uint256 feeAmount,
        uint256 yesReserve,
        uint256 noReserve
    );
    event ResolutionProposed(uint8 outcome, bytes32 evidenceHash, uint256 challengeDeadline);
    event Challenged(address indexed challenger, uint256 bond, bytes32 reasonHash);
    event Finalized(uint8 finalOutcome, bool cancelled);
    event LiquidityRedeemed(address indexed provider, uint256 collateralAmount);
    event CancellationRoundingPolicy(uint256 denominator, string accountingUnit);

    constructor(
        IERC20 collateral_,
        IConditionalTokens ctf_,
        address resolver_,
        address admin_,
        address treasury_,
        bytes32 questionId_,
        bytes32 metadataHash_,
        string memory uri_,
        uint64 closeTime_
    ) {
        if (
            address(collateral_) == address(0) || address(ctf_) == address(0) || resolver_ == address(0)
                || admin_ == address(0) || treasury_ == address(0) || closeTime_ <= block.timestamp
        ) revert InvalidAmount();
        collateral = collateral_;
        ctf = ctf_;
        resolver = resolver_;
        resolutionAdmin = admin_;
        treasury = treasury_;
        factory = msg.sender;
        questionId = questionId_;
        metadataHash = metadataHash_;
        metadataURI = uri_;
        closeTime = closeTime_;
        ctf_.prepareCondition(address(this), questionId_, 2);
        conditionId = ctf_.getConditionId(address(this), questionId_, 2);
        yesPositionId = ctf_.getPositionId(address(collateral_), ctf_.getCollectionId(bytes32(0), conditionId, 1));
        noPositionId = ctf_.getPositionId(address(collateral_), ctf_.getCollectionId(bytes32(0), conditionId, 2));
    }

    function initializeLiquidity(address creator, uint256 amount) external nonReentrant {
        if (msg.sender != factory) revert Unauthorized();
        if (liquidityProvider != address(0) || creator == address(0) || amount == 0) revert InvalidState();
        if (amount > MAX_OPEN_COLLATERAL) revert ReserveLimitExceeded();
        uint256 available = collateral.balanceOf(address(this));
        if (available < amount) revert CollateralInvariantViolation(amount, available);
        liquidityProvider = creator;
        yesReserve = amount;
        noReserve = amount;
        openCollateral = amount;
        collateral.forceApprove(address(ctf), amount);
        ctf.splitPosition(address(collateral), bytes32(0), conditionId, _partition(), amount);
        collateral.forceApprove(address(ctf), 0);
        _assertReserveBacking();
        emit LiquidityInitialized(creator, amount, amount, amount);
    }

    function buy(uint8 side, uint256 collateralIn, uint256 minSharesOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 sharesOut)
    {
        _requireTradable(deadline);
        if (side > 1 || collateralIn == 0) revert InvalidAmount();
        uint256 fee = Math.mulDiv(collateralIn, FEE_BPS, 10_000);
        uint256 net = collateralIn - fee;
        if (net == 0 || openCollateral + net > MAX_OPEN_COLLATERAL) revert ReserveLimitExceeded();

        _collectAndSplit(collateralIn, fee, net);
        sharesOut = _applyBuy(side, net);
        if (sharesOut == 0 || sharesOut < minSharesOut) revert Slippage();
        _sendPosition(msg.sender, side, sharesOut);

        _assertReserveBacking();
        _assertCollateralEscrow();
        emit Trade(msg.sender, side, true, collateralIn, sharesOut, fee, yesReserve, noReserve);
    }

    function _collectAndSplit(uint256 collateralIn, uint256 fee, uint256 net) internal {
        uint256 collateralBefore = collateral.balanceOf(address(this));
        collateral.safeTransferFrom(msg.sender, address(this), collateralIn);
        if (collateral.balanceOf(address(this)) - collateralBefore != collateralIn) revert InvalidAmount();
        if (fee != 0) collateral.safeTransfer(treasury, fee);
        collateral.forceApprove(address(ctf), net);
        ctf.splitPosition(address(collateral), bytes32(0), conditionId, _partition(), net);
        collateral.forceApprove(address(ctf), 0);
    }

    function _applyBuy(uint8 side, uint256 net) internal returns (uint256 sharesOut) {
        uint256 selected = side == 0 ? yesReserve : noReserve;
        uint256 other = side == 0 ? noReserve : yesReserve;
        uint256 productBefore = selected * other;
        uint256 selectedAfter = Math.mulDiv(selected, other, other + net, Math.Rounding.Ceil);
        sharesOut = selected + net - selectedAfter;
        if (side == 0) {
            yesReserve = selectedAfter;
            noReserve = other + net;
        } else {
            noReserve = selectedAfter;
            yesReserve = other + net;
        }
        openCollateral += net;
        if (yesReserve * noReserve < productBefore) revert ReserveInvariantViolation(yesReserve, 0, noReserve, 0);
    }

    function _sendPosition(address recipient, uint8 side, uint256 amount) internal {
        ctf.safeTransferFrom(address(this), recipient, side == 0 ? yesPositionId : noPositionId, amount, "");
    }

    function sell(uint8 side, uint256 sharesIn, uint256 minCollateralOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 collateralOut)
    {
        _requireTradable(deadline);
        if (side > 1 || sharesIn == 0) revert InvalidAmount();
        uint256 productBefore = yesReserve * noReserve;
        ctf.safeTransferFrom(msg.sender, address(this), side == 0 ? yesPositionId : noPositionId, sharesIn, "");
        uint256 grossCollateral = _applySell(side, sharesIn, productBefore);
        if (grossCollateral == 0 || grossCollateral > openCollateral) revert InvalidAmount();
        openCollateral -= grossCollateral;
        if (yesReserve * noReserve < productBefore) revert ReserveInvariantViolation(yesReserve, 0, noReserve, 0);
        ctf.mergePositions(address(collateral), bytes32(0), conditionId, _partition(), grossCollateral);
        uint256 fee = Math.mulDiv(grossCollateral, FEE_BPS, 10_000);
        collateralOut = grossCollateral - fee;
        if (collateralOut < minCollateralOut) revert Slippage();
        if (fee != 0) collateral.safeTransfer(treasury, fee);
        collateral.safeTransfer(msg.sender, collateralOut);
        _assertReserveBacking();
        _assertCollateralEscrow();
        emit Trade(msg.sender, side, false, collateralOut, sharesIn, fee, yesReserve, noReserve);
    }

    function _applySell(uint8 side, uint256 sharesIn, uint256 productBefore)
        internal
        returns (uint256 grossCollateral)
    {
        uint256 selected = (side == 0 ? yesReserve : noReserve) + sharesIn;
        uint256 other = side == 0 ? noReserve : yesReserve;
        if (selected > MAX_OPEN_COLLATERAL || other > MAX_OPEN_COLLATERAL) revert ReserveLimitExceeded();

        uint256 difference = selected > other ? selected - other : other - selected;
        uint256 radicand = difference * difference + 4 * productBefore;
        uint256 root = Math.sqrt(radicand, Math.Rounding.Ceil);
        grossCollateral = (selected + other - root) / 2;

        uint256 selectedAfter = selected - grossCollateral;
        uint256 otherAfter = other - grossCollateral;
        if (side == 0) {
            yesReserve = selectedAfter;
            noReserve = otherAfter;
        } else {
            noReserve = selectedAfter;
            yesReserve = otherAfter;
        }
    }

    function propose(Outcome outcome, bytes32 evidence) external {
        if (msg.sender != resolver) revert Unauthorized();
        if (block.timestamp < closeTime || state != State.OPEN) revert InvalidState();
        state = State.PROPOSED;
        proposedOutcome = outcome;
        proposedAt = uint64(block.timestamp);
        evidenceHash = evidence;
        emit ResolutionProposed(uint8(outcome), evidence, block.timestamp + 1 days);
    }

    function challenge(bytes32 reasonHash) external nonReentrant {
        if (state != State.PROPOSED || block.timestamp > proposedAt + 1 days) revert ChallengeWindowClosed();
        uint256 beforeBalance = collateral.balanceOf(address(this));
        collateral.safeTransferFrom(msg.sender, address(this), CHALLENGE_BOND);
        if (collateral.balanceOf(address(this)) - beforeBalance != CHALLENGE_BOND) revert InvalidAmount();
        challenger = msg.sender;
        challengeEscrow = CHALLENGE_BOND;
        state = State.DISPUTED;
        _assertCollateralEscrow();
        emit Challenged(msg.sender, CHALLENGE_BOND, reasonHash);
    }

    function finalizeUnchallenged() external {
        if (state != State.PROPOSED) revert InvalidState();
        if (block.timestamp <= proposedAt + 1 days) revert ChallengeWindowOpen();
        _resolve(uint8(proposedOutcome) + 1);
    }

    function decideDispute(uint8 result) external nonReentrant {
        if (msg.sender != resolutionAdmin) revert Unauthorized();
        if (state != State.DISPUTED || result > 2 || challengeEscrow != CHALLENGE_BOND) revert InvalidState();
        uint256 bond = challengeEscrow;
        challengeEscrow = 0;
        if (result == uint8(proposedOutcome) + 1) collateral.safeTransfer(treasury, bond);
        else collateral.safeTransfer(challenger, bond);
        _resolve(result);
        _assertCollateralEscrow();
    }

    /// @notice Redeems only AMM-owned reserves; users redeem their positions directly on CTF.
    function redeemLiquidity() external nonReentrant returns (uint256 collateralAmount) {
        if (msg.sender != liquidityProvider) revert Unauthorized();
        if ((state != State.RESOLVED && state != State.CANCELLED) || liquidityRedeemed) revert InvalidState();
        _assertReserveBacking();
        uint256 balanceBefore = collateral.balanceOf(address(this));
        liquidityRedeemed = true;
        yesReserve = 0;
        noReserve = 0;
        ctf.redeemPositions(address(collateral), bytes32(0), conditionId, _partition());
        collateralAmount = collateral.balanceOf(address(this)) - balanceBefore;
        collateral.safeTransfer(liquidityProvider, collateralAmount);
        _assertReserveBacking();
        _assertCollateralEscrow();
        if (state == State.CANCELLED) emit CancellationRoundingPolicy(2, "half-minimum-collateral-unit");
        emit LiquidityRedeemed(liquidityProvider, collateralAmount);
    }

    function invariantsHold() external view returns (bool) {
        return ctf.balanceOf(address(this), yesPositionId) == yesReserve
            && ctf.balanceOf(address(this), noPositionId) == noReserve
            && collateral.balanceOf(address(this)) >= challengeEscrow;
    }

    function _resolve(uint8 result) internal {
        uint256[] memory payouts = new uint256[](2);
        if (result == 0) {
            payouts[0] = 1;
            payouts[1] = 1;
            state = State.CANCELLED;
        } else {
            payouts[result == 1 ? 0 : 1] = 1;
            state = State.RESOLVED;
        }
        ctf.reportPayouts(questionId, payouts);
        emit Finalized(result, result == 0);
    }

    function _requireTradable(uint256 deadline) internal view {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (block.timestamp >= closeTime) revert Closed();
        if (state != State.OPEN || liquidityProvider == address(0)) revert InvalidState();
    }

    function _partition() internal pure returns (uint256[] memory partition) {
        partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;
    }

    function _assertReserveBacking() internal view {
        uint256 actualYes = ctf.balanceOf(address(this), yesPositionId);
        uint256 actualNo = ctf.balanceOf(address(this), noPositionId);
        if (actualYes != yesReserve || actualNo != noReserve) {
            revert ReserveInvariantViolation(yesReserve, actualYes, noReserve, actualNo);
        }
    }

    function _assertCollateralEscrow() internal view {
        uint256 actual = collateral.balanceOf(address(this));
        if (actual < challengeEscrow) revert CollateralInvariantViolation(challengeEscrow, actual);
    }

    function onERC1155Received(address operator, address, uint256, uint256, bytes calldata)
        external
        view
        returns (bytes4)
    {
        if (msg.sender != address(ctf) || operator != address(this)) revert UnsupportedPositionTransfer();
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address operator, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        view
        returns (bytes4)
    {
        if (msg.sender != address(ctf) || operator != address(this)) revert UnsupportedPositionTransfer();
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
