// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Testnet-only parimutuel binary market. Not audited. Do not use with real assets.
contract ForetellTestnetMarket {
    struct Market { string question; uint64 closesAt; bool resolved; bool yesWon; uint256 yesPool; uint256 noPool; }
    IERC20 public immutable collateral;
    address public owner;
    address public oracle;
    address public treasury;
    uint16 public feeBps = 100;
    uint256 public marketCount;
    uint256 private locked = 1;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => uint256)) public yesStake;
    mapping(uint256 => mapping(address => uint256)) public noStake;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event MarketCreated(uint256 indexed id, string question, uint64 closesAt);
    event PositionBought(uint256 indexed id, address indexed user, bool yes, uint256 amount);
    event MarketResolved(uint256 indexed id, bool yesWon);
    event Claimed(uint256 indexed id, address indexed user, uint256 payout);

    modifier onlyOwner() { require(msg.sender == owner, "OWNER"); _; }
    modifier onlyOracle() { require(msg.sender == oracle, "ORACLE"); _; }
    modifier nonReentrant() { require(locked == 1, "LOCKED"); locked = 2; _; locked = 1; }

    constructor(IERC20 collateral_, address oracle_, address treasury_) { collateral = collateral_; oracle = oracle_; treasury = treasury_; owner = msg.sender; }

    function createMarket(string calldata question, uint64 closesAt) external onlyOwner returns (uint256 id) {
        require(bytes(question).length >= 12 && closesAt > block.timestamp, "INVALID");
        id = ++marketCount; markets[id] = Market(question, closesAt, false, false, 0, 0); emit MarketCreated(id, question, closesAt);
    }

    function buy(uint256 id, bool yes, uint256 amount) external nonReentrant {
        Market storage market = markets[id]; require(block.timestamp < market.closesAt && !market.resolved && amount > 0, "CLOSED");
        require(collateral.transferFrom(msg.sender, address(this), amount), "TRANSFER");
        uint256 fee = amount * feeBps / 10_000; uint256 stake = amount - fee;
        if (fee > 0) require(collateral.transfer(treasury, fee), "FEE");
        if (yes) { yesStake[id][msg.sender] += stake; market.yesPool += stake; } else { noStake[id][msg.sender] += stake; market.noPool += stake; }
        emit PositionBought(id, msg.sender, yes, stake);
    }

    function resolve(uint256 id, bool yesWon) external onlyOracle {
        Market storage market = markets[id]; require(block.timestamp >= market.closesAt && !market.resolved, "NOT_READY");
        market.resolved = true; market.yesWon = yesWon; emit MarketResolved(id, yesWon);
    }

    function claim(uint256 id) external nonReentrant {
        Market storage market = markets[id]; require(market.resolved && !claimed[id][msg.sender], "UNAVAILABLE");
        uint256 stake = market.yesWon ? yesStake[id][msg.sender] : noStake[id][msg.sender];
        uint256 winningPool = market.yesWon ? market.yesPool : market.noPool; require(stake > 0 && winningPool > 0, "NO_WIN");
        claimed[id][msg.sender] = true; uint256 payout = (market.yesPool + market.noPool) * stake / winningPool;
        require(collateral.transfer(msg.sender, payout), "PAYOUT"); emit Claimed(id, msg.sender, payout);
    }

    function setOracle(address next) external onlyOwner { require(next != address(0), "ZERO"); oracle = next; }
    function setFee(uint16 next) external onlyOwner { require(next <= 500, "FEE_HIGH"); feeBps = next; }
}
