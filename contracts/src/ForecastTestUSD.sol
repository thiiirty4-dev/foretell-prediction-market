// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract ForecastTestUSD is ERC20, ERC20Permit, AccessControl {
    bytes32 public constant AUTHORIZER_ROLE = keccak256("AUTHORIZER_ROLE");
    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(bytes32 claimId,address wallet,uint256 amount,uint256 expiresAt,uint256 nonce)");
    uint256 public immutable supplyCap;
    mapping(bytes32 => bool) public claimed;
    mapping(uint256 => bool) public nonceUsed;
    error InvalidVoucher();
    error VoucherExpired();
    error AlreadyClaimed();
    error SupplyCapExceeded();
    event VoucherClaimed(bytes32 indexed claimId, address indexed wallet, uint256 amount, uint256 nonce);

    constructor(address admin, address authorizer, uint256 cap)
        ERC20("Forecast Test USD", "fUSD")
        ERC20Permit("Forecast Test USD")
    {
        supplyCap = cap;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AUTHORIZER_ROLE, authorizer);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function claim(
        bytes32 claimId,
        address wallet,
        uint256 amount,
        uint256 expiresAt,
        uint256 nonce,
        bytes calldata signature
    ) external {
        if (block.timestamp > expiresAt) revert VoucherExpired();
        if (claimed[claimId] || nonceUsed[nonce]) revert AlreadyClaimed();
        if (totalSupply() + amount > supplyCap) revert SupplyCapExceeded();
        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH, claimId, wallet, amount, expiresAt, nonce)));
        if (!hasRole(AUTHORIZER_ROLE, ECDSA.recover(digest, signature))) revert InvalidVoucher();
        claimed[claimId] = true;
        nonceUsed[nonce] = true;
        _mint(wallet, amount);
        emit VoucherClaimed(claimId, wallet, amount, nonce);
    }
}
