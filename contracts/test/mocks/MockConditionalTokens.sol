// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Test-only binary implementation of the CTF surface used by BinaryMarket.
/// @dev Collection identifiers are deterministic test hashes, not canonical CTF curve points.
contract MockConditionalTokens is ERC1155 {
    using SafeERC20 for IERC20;

    mapping(bytes32 => bool) public prepared;
    mapping(bytes32 => uint256[2]) private payoutNumerators;
    mapping(bytes32 => uint256) public payoutDenominator;

    constructor() ERC1155("") {}

    function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount) external {
        require(outcomeSlotCount == 2, "binary only");
        prepared[getConditionId(oracle, questionId, outcomeSlotCount)] = true;
    }

    function reportPayouts(bytes32 questionId, uint256[] calldata payouts) external {
        require(payouts.length == 2, "binary only");
        bytes32 conditionId = getConditionId(msg.sender, questionId, 2);
        require(prepared[conditionId] && payoutDenominator[conditionId] == 0, "invalid condition");
        uint256 denominator = payouts[0] + payouts[1];
        require(denominator != 0, "empty payout");
        payoutNumerators[conditionId][0] = payouts[0];
        payoutNumerators[conditionId][1] = payouts[1];
        payoutDenominator[conditionId] = denominator;
    }

    function splitPosition(
        address collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata partition,
        uint256 amount
    ) external {
        _requireBinaryPartition(partition);
        require(prepared[conditionId] && payoutDenominator[conditionId] == 0, "not open");
        IERC20(collateralToken).safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, _positionId(collateralToken, parentCollectionId, conditionId, 1), amount, "");
        _mint(msg.sender, _positionId(collateralToken, parentCollectionId, conditionId, 2), amount, "");
    }

    function mergePositions(
        address collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata partition,
        uint256 amount
    ) external {
        _requireBinaryPartition(partition);
        require(payoutDenominator[conditionId] == 0, "already resolved");
        _burn(msg.sender, _positionId(collateralToken, parentCollectionId, conditionId, 1), amount);
        _burn(msg.sender, _positionId(collateralToken, parentCollectionId, conditionId, 2), amount);
        IERC20(collateralToken).safeTransfer(msg.sender, amount);
    }

    function redeemPositions(
        address collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata indexSets
    ) external {
        uint256 denominator = payoutDenominator[conditionId];
        require(denominator != 0, "not resolved");

        uint256 weightedStake;
        for (uint256 i; i < indexSets.length; ++i) {
            uint256 indexSet = indexSets[i];
            require(indexSet == 1 || indexSet == 2, "invalid index set");
            uint256 positionId = _positionId(collateralToken, parentCollectionId, conditionId, indexSet);
            uint256 stake = balanceOf(msg.sender, positionId);
            if (stake != 0) {
                _burn(msg.sender, positionId, stake);
                weightedStake += stake * payoutNumerators[conditionId][indexSet - 1];
            }
        }

        uint256 payout = weightedStake / denominator;
        if (payout != 0) IERC20(collateralToken).safeTransfer(msg.sender, payout);
    }

    function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount));
    }

    function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(parentCollectionId, conditionId, indexSet));
    }

    function getPositionId(address collateralToken, bytes32 collectionId) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(collateralToken, collectionId)));
    }

    function _positionId(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet)
        private
        pure
        returns (uint256)
    {
        return getPositionId(collateralToken, getCollectionId(parentCollectionId, conditionId, indexSet));
    }

    function _requireBinaryPartition(uint256[] calldata partition) private pure {
        require(partition.length == 2 && partition[0] == 1 && partition[1] == 2, "invalid partition");
    }
}
