// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SibylAttestationsV2
 * @notice Reputation primitive — every analyst signal outcome, permanently linked to
 *         the analyst that called it, with verifiable Pyth price data hash.
 *
 * @dev V2 adds priceUpdateHash to schema. The hash is keccak256 of the Pyth Hermes
 *      response used to compute realizedBps. Anyone can re-fetch Hermes at the
 *      attested timestamp and verify the hash matches — the prices are off-chain
 *      (Pyth not deployed on Kite testnet) but the proof is on-chain.
 *
 *      v1 (0xda942e2deB5E75f662234b0D30b96eBE3A9805D6) remains for historical record.
 *      All new signals post here.
 */
contract SibylAttestationsV2 {
    enum Outcome { Pending, Win, Loss, Neutral }

    struct Attestation {
        bytes32 signalId;
        address analyst;
        address trader;
        int32   realizedBps;
        uint32  holdSeconds;
        Outcome outcome;
        uint64  timestamp;
        bytes32 priceUpdateHash;  // keccak256 of Hermes response (signal + outcome window)
    }

    // ─── Storage ────────────────────────────────────────────────────────────

    mapping(bytes32 => Attestation) public attestations;
    mapping(address => bytes32[])   public attestationsByAnalyst;
    bytes32[] public allAttestations;

    // Per-analyst rolling counters
    mapping(address => uint256) public totalByAnalyst;
    mapping(address => uint256) public winsByAnalyst;
    mapping(address => uint256) public lossesByAnalyst;
    mapping(address => uint256) public neutralsByAnalyst;
    mapping(address => int256)  public cumulativeBpsByAnalyst;

    // ─── Events ─────────────────────────────────────────────────────────────

    event SignalOutcomeAttested(
        bytes32 indexed id,
        bytes32 indexed signalId,
        address indexed analyst,
        address trader,
        int32   realizedBps,
        uint32  holdSeconds,
        Outcome outcome,
        uint64  timestamp,
        bytes32 priceUpdateHash
    );

    // ─── Write ──────────────────────────────────────────────────────────────

    function postAttestation(
        bytes32 signalId,
        address analyst,
        address trader,
        int32   realizedBps,
        uint32  holdSeconds,
        Outcome outcome,
        bytes32 priceUpdateHash
    ) external returns (bytes32 id) {
        require(analyst != address(0), "analyst=0");
        require(trader  != address(0), "trader=0");
        require(signalId != bytes32(0), "signalId=0");
        require(priceUpdateHash != bytes32(0), "priceUpdateHash=0");

        id = keccak256(abi.encode(signalId, analyst, trader, block.timestamp));
        require(attestations[id].timestamp == 0, "already attested");

        uint64 ts = uint64(block.timestamp);

        attestations[id] = Attestation({
            signalId: signalId,
            analyst: analyst,
            trader: trader,
            realizedBps: realizedBps,
            holdSeconds: holdSeconds,
            outcome: outcome,
            timestamp: ts,
            priceUpdateHash: priceUpdateHash
        });

        attestationsByAnalyst[analyst].push(id);
        allAttestations.push(id);

        totalByAnalyst[analyst] += 1;
        if (outcome == Outcome.Win)      winsByAnalyst[analyst]    += 1;
        else if (outcome == Outcome.Loss) lossesByAnalyst[analyst]  += 1;
        else if (outcome == Outcome.Neutral) neutralsByAnalyst[analyst] += 1;

        cumulativeBpsByAnalyst[analyst] += int256(realizedBps);

        emit SignalOutcomeAttested(
            id, signalId, analyst, trader,
            realizedBps, holdSeconds, outcome, ts, priceUpdateHash
        );
    }

    // ─── Reads ──────────────────────────────────────────────────────────────

    function getAttestation(bytes32 id) external view returns (Attestation memory) {
        return attestations[id];
    }

    function totalAttestations() external view returns (uint256) {
        return allAttestations.length;
    }

    function analystSummary(address analyst) external view returns (
        uint256 total,
        uint256 wins,
        uint256 losses,
        uint256 neutrals,
        int256  cumulativeBps
    ) {
        total         = totalByAnalyst[analyst];
        wins          = winsByAnalyst[analyst];
        losses        = lossesByAnalyst[analyst];
        neutrals      = neutralsByAnalyst[analyst];
        cumulativeBps = cumulativeBpsByAnalyst[analyst];
    }
}
