// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SibylAttestations
 * @notice Sibyl's on-chain reputation primitive.
 *
 * Every signal purchase in Sibyl produces an optional attestation: after the
 * Trader consumes a signal, it posts the realized outcome back to the
 * Analyst's Passport. Over time, this builds a verifiable, portable track
 * record that anyone can query.
 *
 * The schema is baked on-chain so that any future agent, explorer, or
 * downstream protocol can discover what a Sibyl attestation means without
 * reading this source. This is the "stealing EAS's best idea" part.
 *
 * Two indexed views of the same data: by analyst (reputation leaderboard)
 * and by trader (personal track record). One write, two reads.
 */
contract SibylAttestations {
    // ─── Schema (self-describing, on-chain) ──────────────────────────────────

    string public constant SCHEMA_VERSION = "sibyl.v1";
    string public constant SCHEMA =
        "SignalOutcome(bytes32 signalId, address analyst, address trader, "
        "int32 realizedBps, uint32 holdSeconds, uint8 outcome, uint256 timestamp)";

    // ─── Types ───────────────────────────────────────────────────────────────

    /// @dev Outcome classification. Win/Loss use the realizedBps sign; Neutral
    /// is for trades that closed within a small band (typically ±25 bps).
    enum Outcome { Pending, Win, Loss, Neutral }

    struct Attestation {
        bytes32 signalId;       // links back to the original signal purchase
        address analyst;        // who sold the signal
        address trader;         // who traded on it
        int32   realizedBps;    // realized P&L, signed basis points
        uint32  holdSeconds;    // how long the trader held the position
        Outcome outcome;
        uint64  timestamp;
    }

    // ─── Storage ─────────────────────────────────────────────────────────────

    mapping(bytes32 => Attestation) private _byId;
    mapping(address => bytes32[])   private _byAnalyst;
    mapping(address => bytes32[])   private _byTrader;

    uint256 public totalAttestations;

    // ─── Events ──────────────────────────────────────────────────────────────

    event AttestationPosted(
        bytes32 indexed attestationId,
        address indexed analyst,
        address indexed trader,
        bytes32 signalId,
        int32   realizedBps,
        uint32  holdSeconds,
        Outcome outcome,
        uint64  timestamp
    );

    // ─── Write ───────────────────────────────────────────────────────────────

    /**
     * @notice Post an attestation. msg.sender is recorded as the trader.
     * @dev Anyone can post; the value is in the public, permanent record.
     *      Off-chain consumers should verify msg.sender matches expected Trader.
     */
    function postAttestation(
        bytes32 signalId,
        address analyst,
        int32   realizedBps,
        uint32  holdSeconds,
        Outcome outcome
    ) external returns (bytes32 attestationId) {
        require(analyst != address(0), "analyst=0");
        require(outcome != Outcome.Pending, "outcome=pending");

        attestationId = keccak256(
            abi.encode(signalId, analyst, msg.sender, block.timestamp, totalAttestations)
        );

        _byId[attestationId] = Attestation({
            signalId:    signalId,
            analyst:     analyst,
            trader:      msg.sender,
            realizedBps: realizedBps,
            holdSeconds: holdSeconds,
            outcome:     outcome,
            timestamp:   uint64(block.timestamp)
        });

        _byAnalyst[analyst].push(attestationId);
        _byTrader[msg.sender].push(attestationId);

        unchecked { totalAttestations++; }

        emit AttestationPosted(
            attestationId,
            analyst,
            msg.sender,
            signalId,
            realizedBps,
            holdSeconds,
            outcome,
            uint64(block.timestamp)
        );
    }

    // ─── Read ────────────────────────────────────────────────────────────────

    function getAttestation(bytes32 id) external view returns (Attestation memory) {
        return _byId[id];
    }

    function attestationsByAnalyst(address analyst) external view returns (bytes32[] memory) {
        return _byAnalyst[analyst];
    }

    function attestationsByTrader(address trader) external view returns (bytes32[] memory) {
        return _byTrader[trader];
    }

    function countByAnalyst(address analyst) external view returns (uint256) {
        return _byAnalyst[analyst].length;
    }

    function countByTrader(address trader) external view returns (uint256) {
        return _byTrader[trader].length;
    }

    /**
     * @notice On-chain minimal reputation summary for an analyst.
     * @dev Rich stats (Sharpe, drawdown) are computed off-chain from these primitives.
     */
    function analystSummary(address analyst) external view returns (
        uint256 total,
        uint256 wins,
        uint256 losses,
        uint256 neutrals,
        int256  cumulativeBps
    ) {
        bytes32[] memory ids = _byAnalyst[analyst];
        total = ids.length;
        for (uint256 i = 0; i < ids.length; i++) {
            Attestation memory a = _byId[ids[i]];
            if (a.outcome == Outcome.Win)      wins++;
            else if (a.outcome == Outcome.Loss) losses++;
            else if (a.outcome == Outcome.Neutral) neutrals++;
            cumulativeBps += int256(a.realizedBps);
        }
    }
}
