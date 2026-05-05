// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title SibylSubscriptions
 * @notice On-chain subscription marketplace for Sibyl analyst signals.
 *
 * @dev Design notes:
 *   - Subscriptions are PER subscriber + analyst pair. Each pair has an
 *     `expiresAt` timestamp.
 *   - Pricing is flat per the contract: 0.5 USDT for 30 days. Set at
 *     deploy time, not per-analyst (simplicity beats configurability for v1).
 *   - Renewals extend from the LATER of (now, current expiry). So renewing
 *     mid-subscription stacks days, doesn't waste them.
 *   - No refunds. Subscriptions are firm. Reputation is the safeguard.
 *   - Treasury collects USDT. Owner can sweep. Not split per-analyst yet
 *     (Day 11+ work — analyst earnings claim flow).
 *
 *   USDT on Kite testnet has 18 decimals (not 6 like mainnet). PRICE constant
 *   is set in 18-decimal units.
 */
contract SibylSubscriptions {
    // ─── Config (immutable after deploy) ─────────────────────────────────────

    address public immutable usdt;
    address public owner;
    uint256 public constant PRICE_PER_PERIOD = 0.5 ether; // 0.5 USDT (18 decimals)
    uint64  public constant PERIOD_SECONDS = 30 days;

    // ─── State ───────────────────────────────────────────────────────────────

    /// subscriber => analyst => expiry timestamp (unix seconds)
    mapping(address => mapping(address => uint64)) public expiresAt;

    /// analyst => total subscribers ever (for sorting / display, not unique)
    mapping(address => uint256) public totalSubscribersByAnalyst;

    /// analyst => total revenue (USDT 18-dec units)
    mapping(address => uint256) public revenueByAnalyst;

    /// global running total of revenue collected
    uint256 public totalRevenue;

    // ─── Events ──────────────────────────────────────────────────────────────

    event Subscribed(
        address indexed subscriber,
        address indexed analyst,
        uint64  expiresAt,
        uint256 amountPaid
    );

    event TreasurySwept(address indexed to, uint256 amount);

    // ─── Constructor ────────────────────────────────────────────────────────

    constructor(address _usdt) {
        require(_usdt != address(0), "usdt=0");
        usdt = _usdt;
        owner = msg.sender;
    }

    // ─── Subscribe ──────────────────────────────────────────────────────────

    /**
     * Subscribe to an analyst for one period (30 days).
     *
     * Subscriber must have approved this contract to spend PRICE_PER_PERIOD
     * USDT before calling.
     *
     * Renewing mid-subscription stacks: new expiry = max(now, currentExpiry) + period.
     */
    function subscribe(address analyst) external returns (uint64 newExpiry) {
        require(analyst != address(0), "analyst=0");

        // Pull payment. Reverts on insufficient allowance / balance.
        bool ok = IERC20(usdt).transferFrom(msg.sender, address(this), PRICE_PER_PERIOD);
        require(ok, "transferFrom failed");

        uint64 currentExpiry = expiresAt[msg.sender][analyst];
        uint64 base = currentExpiry > uint64(block.timestamp) ? currentExpiry : uint64(block.timestamp);
        newExpiry = base + PERIOD_SECONDS;

        expiresAt[msg.sender][analyst] = newExpiry;

        // Bookkeeping (best-effort, doesn't gate the subscription)
        totalSubscribersByAnalyst[analyst] += 1;
        revenueByAnalyst[analyst] += PRICE_PER_PERIOD;
        totalRevenue += PRICE_PER_PERIOD;

        emit Subscribed(msg.sender, analyst, newExpiry, PRICE_PER_PERIOD);
    }

    // ─── Reads ──────────────────────────────────────────────────────────────

    function isSubscribed(address subscriber, address analyst) external view returns (bool) {
        return expiresAt[subscriber][analyst] > uint64(block.timestamp);
    }

    function timeRemaining(address subscriber, address analyst) external view returns (uint64) {
        uint64 exp = expiresAt[subscriber][analyst];
        if (exp <= uint64(block.timestamp)) return 0;
        return exp - uint64(block.timestamp);
    }

    // ─── Owner ──────────────────────────────────────────────────────────────

    /**
     * Sweep accumulated USDT to a target address. Owner-only.
     *
     * Day 11+: replace with per-analyst claim() so each analyst pulls their own
     * earnings, not the contract owner. For now, simple sweep keeps Day 10 small.
     */
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
