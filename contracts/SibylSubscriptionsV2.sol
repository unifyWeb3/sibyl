// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title SibylSubscriptionsV2
 * @notice On-chain subscription marketplace with REAL duration support.
 *
 * @dev Day 13 redesign:
 *   - Pricing is per-DAY, not per-30-days. PRICE_PER_DAY = 0.5 USDT / 30 days
 *     ~= 0.01666... USDT/day. Internally we use 16666666666666667 wei (18 dec).
 *   - subscribe(analyst, days) charges PRICE_PER_DAY * days, extends expiry by
 *     `days * 1 day` from max(now, currentExpiry).
 *   - Caller passes the duration. Contract enforces min 1 day, max 365 days.
 *   - Renewals stack from current expiry, not from now (no waste).
 *   - No refunds. Reputation is the safeguard.
 *
 *   USDT on Kite testnet has 18 decimals (verified Day 1).
 */
contract SibylSubscriptionsV2 {
    address public immutable usdt;
    address public owner;

    /// 0.5 USDT / 30 days = 16666666666666667 wei/day (rounds up at the 17th place).
    /// 7d = 0.116666... USDT, 14d = 0.233..., 30d = 0.5, 60d = 1.0
    uint256 public constant PRICE_PER_DAY = 16_666_666_666_666_667;

    uint64  public constant MIN_DAYS = 1;
    uint64  public constant MAX_DAYS = 365;
    uint64  public constant SECONDS_PER_DAY = 1 days;

    /// subscriber => analyst => expiry timestamp
    mapping(address => mapping(address => uint64)) public expiresAt;

    /// analyst => total subscribe calls (for display, not unique subs)
    mapping(address => uint256) public totalSubscribersByAnalyst;

    /// analyst => total revenue (USDT 18-dec)
    mapping(address => uint256) public revenueByAnalyst;

    uint256 public totalRevenue;

    event Subscribed(
        address indexed subscriber,
        address indexed analyst,
        uint64  expiresAt,
        uint64  daysAdded,
        uint256 amountPaid
    );

    event TreasurySwept(address indexed to, uint256 amount);

    constructor(address _usdt) {
        require(_usdt != address(0), "usdt=0");
        usdt = _usdt;
        owner = msg.sender;
    }

    /**
     * @notice Subscribe to an analyst for `daysCount` days.
     * @dev Caller must approve PRICE_PER_DAY * daysCount USDT first.
     *      Renewing extends from max(now, currentExpiry) — no day is wasted.
     */
    function subscribe(address analyst, uint64 daysCount) external returns (uint64 newExpiry) {
        require(analyst != address(0), "analyst=0");
        require(daysCount >= MIN_DAYS && daysCount <= MAX_DAYS, "bad daysCount");

        uint256 cost = PRICE_PER_DAY * uint256(daysCount);
        bool ok = IERC20(usdt).transferFrom(msg.sender, address(this), cost);
        require(ok, "transferFrom failed");

        uint64 currentExpiry = expiresAt[msg.sender][analyst];
        uint64 base = currentExpiry > uint64(block.timestamp) ? currentExpiry : uint64(block.timestamp);
        newExpiry = base + (daysCount * SECONDS_PER_DAY);

        expiresAt[msg.sender][analyst] = newExpiry;

        totalSubscribersByAnalyst[analyst] += 1;
        revenueByAnalyst[analyst] += cost;
        totalRevenue += cost;

        emit Subscribed(msg.sender, analyst, newExpiry, daysCount, cost);
    }

    function isSubscribed(address subscriber, address analyst) external view returns (bool) {
        return expiresAt[subscriber][analyst] > uint64(block.timestamp);
    }

    function timeRemaining(address subscriber, address analyst) external view returns (uint64) {
        uint64 exp = expiresAt[subscriber][analyst];
        if (exp <= uint64(block.timestamp)) return 0;
        return exp - uint64(block.timestamp);
    }

    /// Convenience for UI — quote cost upfront.
    function quoteCost(uint64 daysCount) external pure returns (uint256) {
        return PRICE_PER_DAY * uint256(daysCount);
    }

    function sweep(address to) external returns (uint256 amount) {
        require(msg.sender == owner, "not owner");
        require(to != address(0), "to=0");
        amount = IERC20(usdt).balanceOf(address(this));
        if (amount > 0) {
            bool ok = IERC20(usdt).transfer(to, amount);
            require(ok, "sweep failed");
            emit TreasurySwept(to, amount);
        }
    }

    function setOwner(address newOwner) external {
        require(msg.sender == owner, "not owner");
        require(newOwner != address(0), "newOwner=0");
        owner = newOwner;
    }
}
