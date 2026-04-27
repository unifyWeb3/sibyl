// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SibylAnalysts
 * @notice Registry of all analysts in the Sibyl economy.
 *
 *   • Owner can `registerExisting()` to back-register pre-deployed analysts (M2 era).
 *   • Anyone can call `registerSelf()` to add their own AA wallet to the registry.
 *     The msg.sender must be the AA wallet they're registering, OR the user pre-funds
 *     the AA and signs a userOp from it. (For our Day-3-Day-4 flow, registration
 *     happens after the AA wallet is deployed by a backend script, then the
 *     backend script's EOA registers it via `registerExisting` since the EOA owns
 *     a signing relationship with the AA. We can relax this later.)
 *
 * Schema baked on-chain so anyone can discover Sibyl analysts without docs.
 */
contract SibylAnalysts {
    // ─── Schema ──────────────────────────────────────────────────────────────

    string public constant SCHEMA_VERSION = "sibyl.analysts.v1";
    string public constant SCHEMA =
        "Analyst(address aa, string name, uint8 strategy, address creator, uint64 createdAt)";

    /// @dev Strategy classifications. Matches our agent-personality system.
    enum Strategy {
        Bear,       // shorts trends, fades pumps
        Chaser,     // momentum, follows breakouts
        Reverter,   // mean reversion, fades extremes
        Custom      // for user-defined strategies (forward-compatible)
    }

    struct Analyst {
        address aa;
        string  name;
        Strategy strategy;
        address creator;     // EOA that paid to deploy this analyst
        uint64  createdAt;
    }

    // ─── Storage ─────────────────────────────────────────────────────────────

    address public owner;
    mapping(address => Analyst) private _byAa;
    mapping(address => bool) private _registered;
    address[] private _allAas;

    // ─── Events ──────────────────────────────────────────────────────────────

    event AnalystRegistered(
        address indexed aa,
        string name,
        Strategy strategy,
        address indexed creator,
        uint64 createdAt
    );

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ─── Registration ────────────────────────────────────────────────────────

    /**
     * @notice Owner-only: register a pre-existing AA wallet as an analyst.
     * Used to back-register analysts deployed before this contract existed.
     * @param aa The AA wallet address to register.
     * @param name Display name (1-30 chars).
     * @param strategy Strategy enum (0..3).
     * @param creator The EOA that paid to deploy `aa` (informational).
     */
    function registerExisting(
        address aa,
        string calldata name,
        Strategy strategy,
        address creator
    ) external onlyOwner {
        _register(aa, name, strategy, creator);
    }

    /**
     * @notice Permissionless: register an AA wallet you control as an analyst.
     * msg.sender is recorded as the creator. Anyone can call this — Sibyl is
     * an open marketplace.
     * @param aa The AA wallet address to register (must not already be registered).
     * @param name Display name (1-30 chars).
     * @param strategy Strategy enum.
     */
    function registerSelf(
        address aa,
        string calldata name,
        Strategy strategy
    ) external {
        _register(aa, name, strategy, msg.sender);
    }

    function _register(
        address aa,
        string memory name,
        Strategy strategy,
        address creator
    ) internal {
        require(aa != address(0), "aa=0");
        require(!_registered[aa], "already registered");
        require(bytes(name).length > 0 && bytes(name).length <= 30, "bad name length");
        require(uint8(strategy) <= uint8(Strategy.Custom), "bad strategy");

        uint64 ts = uint64(block.timestamp);
        _byAa[aa] = Analyst({
            aa: aa,
            name: name,
            strategy: strategy,
            creator: creator,
            createdAt: ts
        });
        _registered[aa] = true;
        _allAas.push(aa);

        emit AnalystRegistered(aa, name, strategy, creator, ts);
    }

    // ─── Queries ─────────────────────────────────────────────────────────────

    function isRegistered(address aa) external view returns (bool) {
        return _registered[aa];
    }

    function getAnalyst(address aa) external view returns (Analyst memory) {
        require(_registered[aa], "not registered");
        return _byAa[aa];
    }

    function totalAnalysts() external view returns (uint256) {
        return _allAas.length;
    }

    function allAnalysts() external view returns (address[] memory) {
        return _allAas;
    }

    /**
     * @notice Page through analysts (for UIs that don't want to load all at once).
     */
    function analystsPaged(uint256 offset, uint256 limit)
        external view returns (Analyst[] memory page)
    {
        uint256 end = offset + limit;
        if (end > _allAas.length) end = _allAas.length;
        if (offset >= end) return new Analyst[](0);

        page = new Analyst[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _byAa[_allAas[i]];
        }
    }

    // ─── Ownership ───────────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "new=0");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
