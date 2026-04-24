/**
 * services/kite/attestation.ts
 *
 * Helpers around SibylAttestations.sol — Sibyl's reputation primitive.
 *
 * M5 note on msg.sender strategy:
 *   We attempted posting via Trader AA userOp (matching M2/M4 pattern) but
 *   Kite's staging paymaster reverts in its postOp callback for calls that
 *   write to new contract state + dynamic arrays. The contract logic itself
 *   is correct (verified via eth_call).
 *
 *   For M5 we post attestations via EOA direct. This means msg.sender on-chain
 *   is the EOA, not the Trader AA. Day 2 we'll investigate the paymaster
 *   issue and route through AA properly. For now: pragmatic > pure.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { Wallet, ContractFactory, Contract, Interface, JsonRpcProvider } from 'ethers';

const CONTRACTS_REGISTRY_PATH = '.sibyl/contracts.json';

// ─── Outcome enum (mirrors Solidity) ─────────────────────────────────────────

export enum Outcome {
  Pending = 0,
  Win = 1,
  Loss = 2,
  Neutral = 3,
}

// ─── Denormalized attestation record for UI/logs ─────────────────────────────

export interface AttestationRecord {
  id: string;
  signalId: string;
  analyst: string;
  trader: string;
  realizedBps: number;
  holdSeconds: number;
  outcome: Outcome;
  outcomeLabel: 'Win' | 'Loss' | 'Neutral' | 'Pending';
  timestamp: number;
}

export interface AnalystSummary {
  total: number;
  wins: number;
  losses: number;
  neutrals: number;
  cumulativeBps: number;
  hitRate: number;
  avgBps: number;
}

// ─── Compile ─────────────────────────────────────────────────────────────────

export async function compileAttestations(): Promise<{ abi: any[]; bytecode: string }> {
  const solcModule = await import('solc');
  const solc: any = (solcModule as any).default ?? solcModule;
  const source = readFileSync('contracts/SibylAttestations.sol', 'utf-8');

  const input = {
    language: 'Solidity',
    sources: { 'SibylAttestations.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const fatal = output.errors.filter((e: any) => e.severity === 'error');
    if (fatal.length) {
      throw new Error('Compilation failed:\n' + fatal.map((e: any) => e.formattedMessage).join('\n'));
    }
  }

  const contract = output.contracts['SibylAttestations.sol']['SibylAttestations'];
  return {
    abi: contract.abi,
    bytecode: '0x' + contract.evm.bytecode.object,
  };
}

// ─── Deploy ─────────────────────────────────────────────────────────────────

export async function deployAttestations(
  rpcUrl: string,
  signerKey: string
): Promise<{ address: string; txHash: string; abi: any[] }> {
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(signerKey, provider);

  const { abi, bytecode } = await compileAttestations();
  const factory = new ContractFactory(abi, bytecode, wallet);

  console.log('  [attest]  deploying SibylAttestations...');
  const contract = await factory.deploy();
  const tx = contract.deploymentTransaction();
  if (!tx) throw new Error('no deployment tx returned');
  console.log(`  [attest]  deploy tx: ${tx.hash}`);

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`  [attest]  ✓ deployed at ${address}`);
  return { address, txHash: tx.hash, abi };
}

// ─── Registry ────────────────────────────────────────────────────────────────

interface ContractRegistry {
  network: string;
  chainId: number;
  contracts: {
    SibylAttestations?: {
      address: string;
      deployTxHash: string;
      deployedAt: string;
    };
  };
}

export function loadContracts(): ContractRegistry {
  if (!existsSync(CONTRACTS_REGISTRY_PATH)) {
    return { network: 'kite_testnet', chainId: 2368, contracts: {} };
  }
  return JSON.parse(readFileSync(CONTRACTS_REGISTRY_PATH, 'utf-8'));
}

export function saveContracts(registry: ContractRegistry): void {
  const dir = dirname(CONTRACTS_REGISTRY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONTRACTS_REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

// ─── Post attestation (EOA direct — pragmatic path for M5) ───────────────────

/**
 * Post an attestation from the EOA directly.
 * msg.sender on-chain = EOA (not Trader AA). For M5 this is acceptable.
 * Day 2 we'll debug the paymaster postOp issue and route through AA.
 */
export async function postAttestationDirect(params: {
  rpcUrl: string;
  signerKey: string;
  attestationsAddress: string;
  signalId: string;
  analyst: string;
  realizedBps: number;
  holdSeconds: number;
  outcome: Outcome;
}): Promise<{ txHash: string; attestationId: string }> {
  const provider = new JsonRpcProvider(params.rpcUrl);
  const wallet = new Wallet(params.signerKey, provider);

  const iface = new Interface([
    'function postAttestation(bytes32 signalId, address analyst, int32 realizedBps, uint32 holdSeconds, uint8 outcome) returns (bytes32)',
    'event AttestationPosted(bytes32 indexed attestationId, address indexed analyst, address indexed trader, bytes32 signalId, int32 realizedBps, uint32 holdSeconds, uint8 outcome, uint64 timestamp)',
  ]);

  const contract = new Contract(params.attestationsAddress, iface, wallet);

  const tx = await contract.postAttestation(
    params.signalId,
    params.analyst,
    params.realizedBps,
    params.holdSeconds,
    params.outcome
  );

  const receipt = await tx.wait();
  if (!receipt) throw new Error('tx receipt missing');

  let attestationId = '';
  const eventTopic = iface.getEvent('AttestationPosted')!.topicHash;
  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === params.attestationsAddress.toLowerCase() &&
      log.topics[0] === eventTopic
    ) {
      attestationId = log.topics[1];
      break;
    }
  }

  return { txHash: receipt.hash, attestationId };
}

// ─── Query ───────────────────────────────────────────────────────────────────

export async function fetchAttestationsForAnalyst(
  rpcUrl: string,
  attestationsAddress: string,
  analyst: string
): Promise<AttestationRecord[]> {
  const provider = new JsonRpcProvider(rpcUrl);
  const contract = new Contract(
    attestationsAddress,
    [
      'function attestationsByAnalyst(address) view returns (bytes32[])',
      'function getAttestation(bytes32) view returns (tuple(bytes32 signalId, address analyst, address trader, int32 realizedBps, uint32 holdSeconds, uint8 outcome, uint64 timestamp))',
    ],
    provider
  );

  const ids: string[] = await contract.attestationsByAnalyst(analyst);
  const records: AttestationRecord[] = [];

  for (const id of ids) {
    const a = await contract.getAttestation(id);
    records.push({
      id,
      signalId: a.signalId,
      analyst: a.analyst,
      trader: a.trader,
      realizedBps: Number(a.realizedBps),
      holdSeconds: Number(a.holdSeconds),
      outcome: Number(a.outcome) as Outcome,
      outcomeLabel: outcomeLabel(Number(a.outcome)),
      timestamp: Number(a.timestamp),
    });
  }

  return records;
}

export async function fetchAnalystSummary(
  rpcUrl: string,
  attestationsAddress: string,
  analyst: string
): Promise<AnalystSummary> {
  const provider = new JsonRpcProvider(rpcUrl);
  const contract = new Contract(
    attestationsAddress,
    [
      'function analystSummary(address) view returns (uint256 total, uint256 wins, uint256 losses, uint256 neutrals, int256 cumulativeBps)',
    ],
    provider
  );

  const [total, wins, losses, neutrals, cumulativeBps] = await contract.analystSummary(analyst);
  const totalN = Number(total);
  const winsN = Number(wins);
  const scored = winsN + Number(losses) + Number(neutrals);

  return {
    total: totalN,
    wins: winsN,
    losses: Number(losses),
    neutrals: Number(neutrals),
    cumulativeBps: Number(cumulativeBps),
    hitRate: scored > 0 ? winsN / scored : 0,
    avgBps: totalN > 0 ? Number(cumulativeBps) / totalN : 0,
  };
}

function outcomeLabel(v: number): 'Win' | 'Loss' | 'Neutral' | 'Pending' {
  return (['Pending', 'Win', 'Loss', 'Neutral'] as const)[v] ?? 'Pending';
}
