// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SibylAttestationsV2 {
    string public constant SCHEMA_VERSION = "sibyl.v2";
    string public constant SCHEMA = 
        "SignalOutcome(bytes32 signalId, address analyst, address trader, "
        "int32 realizedBps, uint32 holdSeconds, uint8 outcome, uint256 timestamp, bytes32 priceUpdateHash)";
    
    enum Outcome { Pending, Win, Loss, Neutral }
    
    struct Attestation {
        bytes32 signalId;
        address analyst;
        address trader;
        int32   realizedBps;
        uint32  holdSeconds;
        Outcome outcome;
        uint256 timestamp;
        bytes32 priceUpdateHash;
    }
    
    mapping(address => bytes32[]) private _byAnalyst;
    mapping(address => bytes32[]) private _byTrader;
    mapping(bytes32 => Attestation) private _byId;
    uint256 public total;

    event AttestationPosted(
        bytes32 indexed attestationId,
        address indexed analyst,
        address indexed trader,
        int32 realizedBps,
        Outcome outcome,
        bytes32 priceUpdateHash
    );

    function postAttestation(
        bytes32 signalId, address analyst, int32 realizedBps,
        uint32 holdSeconds, Outcome outcome, bytes32 priceUpdateHash
    ) external returns (bytes32 attestationId) {
        attestationId = keccak256(abi.encode(signalId, analyst, msg.sender, block.timestamp));
        require(_byId[attestationId].timestamp == 0, "duplicate");
        
        _byId[attestationId] = Attestation({
            signalId, analyst, msg.sender, realizedBps, 
            holdSeconds, outcome, block.timestamp, priceUpdateHash
        });
        _byAnalyst[analyst].push(attestationId);
        _byTrader[msg.sender].push(attestationId);
        total++;
        emit AttestationPosted(attestationId, analyst, msg.sender, realizedBps, outcome, priceUpdateHash);
    }

    function getAttestation(bytes32 id) external view returns (Attestation memory) { return _byId[id]; }
    function attestationsByAnalyst(address a) external view returns (bytes32[] memory) { return _byAnalyst[a]; }
    function attestationsByTrader(address t) external view returns (bytes32[] memory) { return _byTrader[t]; }
}