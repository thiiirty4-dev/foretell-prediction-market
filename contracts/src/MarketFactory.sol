// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IConditionalTokens} from "./IConditionalTokens.sol";
import {BinaryMarket} from "./BinaryMarket.sol";

contract MarketFactory is AccessControl, EIP712 {
    using SafeERC20 for IERC20;

    bytes32 public constant AUTHORIZER_ROLE = keccak256("AUTHORIZER_ROLE");
    bytes32 public constant PUBLISH_TYPEHASH = keccak256(
        "Publish(address creator,bytes32 metadataHash,bytes32 uriHash,uint64 closeTime,uint256 liquidity,uint256 nonce,uint256 expiresAt)"
    );
    uint256 public constant INITIAL_LIQUIDITY = 1000e6;

    IERC20 public immutable collateral;
    IConditionalTokens public immutable ctf;
    address public immutable resolver;
    address public immutable resolutionAdmin;
    address public immutable treasury;
    mapping(uint256 => bool) public nonceUsed;

    error InvalidAuthorization();
    error InvalidParameters();

    event MarketCreated(
        address indexed market,
        address indexed creator,
        bytes32 indexed metadataHash,
        string metadataURI,
        uint64 closeTime,
        uint256 mechanismVersion
    );

    constructor(
        IERC20 collateral_,
        IConditionalTokens ctf_,
        address admin,
        address authorizer,
        address resolver_,
        address resolutionAdmin_,
        address treasury_
    ) EIP712("ForecastMarketFactory", "1") {
        collateral = collateral_;
        ctf = ctf_;
        resolver = resolver_;
        resolutionAdmin = resolutionAdmin_;
        treasury = treasury_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AUTHORIZER_ROLE, authorizer);
    }

    function publish(
        bytes32 metadataHash,
        string calldata uri,
        uint64 closeTime,
        uint256 nonce,
        uint256 expiresAt,
        bytes calldata signature
    ) external returns (address) {
        if (block.timestamp > expiresAt || nonceUsed[nonce]) revert InvalidAuthorization();
        if (closeTime < block.timestamp + 1 days || closeTime > block.timestamp + 365 days) {
            revert InvalidParameters();
        }

        {
            bytes32 structHash = keccak256(
                abi.encode(
                    PUBLISH_TYPEHASH,
                    msg.sender,
                    metadataHash,
                    keccak256(bytes(uri)),
                    closeTime,
                    INITIAL_LIQUIDITY,
                    nonce,
                    expiresAt
                )
            );
            address signer = ECDSA.recover(_hashTypedDataV4(structHash), signature);
            if (!hasRole(AUTHORIZER_ROLE, signer)) revert InvalidAuthorization();
        }

        nonceUsed[nonce] = true;
        bytes32 questionId = keccak256(abi.encode(block.chainid, msg.sender, metadataHash, nonce));
        BinaryMarket market = _deployMarket(questionId, metadataHash, uri, closeTime);
        collateral.safeTransferFrom(msg.sender, address(market), INITIAL_LIQUIDITY);
        market.initializeLiquidity(msg.sender, INITIAL_LIQUIDITY);

        emit MarketCreated(address(market), msg.sender, metadataHash, uri, closeTime, 1);
        return address(market);
    }

    function _deployMarket(bytes32 questionId, bytes32 metadataHash, string calldata uri, uint64 closeTime)
        internal
        returns (BinaryMarket)
    {
        return new BinaryMarket(
            collateral, ctf, resolver, resolutionAdmin, treasury, questionId, metadataHash, uri, closeTime
        );
    }
}
