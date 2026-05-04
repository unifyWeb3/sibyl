/**
 * Seed The Oracle with real-Pyth-backed attestations.
 *
 * Posts N attestations spaced HOLD seconds apart, each using real BTC/USD
 * prices from Hermes at signal time and outcome time.
 *
 * Default: 5 attestations × 30s hold = ~150s wallclock total.
 *
 * Usage:
 *   pnpm tsx scripts/09_seed_oracle_v2.ts
 *   pnpm tsx scripts/09_seed_oracle_v2.ts --count=8 --hold=20
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { JsonRpcProvider, Wallet, Contract, keccak256, toUtf8Bytes } from 'ethers';
import { readFileSync } from 'fs';
import {
  fetchLatestPrice,
  realizedBps,
  classifyOutcome,
} from '../services/oracle/hermes';

const RPC_URL = process.env.KITE_RPC_URL ?? 'https://rpc-testnet.gokite.ai';
const PRIVATE_KEY = process.env.HACKATHON_PRIVATE_KEY!;
if (!PRIVATE_KEY) throw new Error('HACKATHON_PRIVATE_KEY missing');

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const COUNT = Number(args.count ?? 5);
const HOLD_SECONDS = Number(args.hold ?? 30);

// Mix of directions to make outcomes interesting
const DIRECTIONS: Array<'long' | 'short'> = ['short', 'long', 'short', 'long', 'short', 'long', 'short', 'long'];

const ATTESTATIONS_V2_ABI = [
  {
    type: 'function',
    name: 'postAttestation',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'signalId', type: 'bytes32' },
      { name: 'analyst', type: 'address' },
      { name: 'trader', type: 'address' },
      { name: 'realizedBps', type: 'int32' },
      { name: 'holdSeconds', type: 'uint32' },
      { name: 'outcome', type: 'uint8' },
      { name: 'priceUpdateHash', type: 'bytes32' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'totalAttestations',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
];

async function postOne(
  contract: Contract,
  analystAa: string,
  traderAa: string,
  direction: 'long' | 'short',
  attestationNum: number
): Promise<{ bps: number; outcome: string; tx: string }> {
  console.log(`\n──── Attestation ${attestationNum}/${COUNT} (${direction}) ────`);

  console.log('▸ Entry price...');
  const entry = await fetchLatestPrice('BTC_USD');
  console.log(`  BTC: $${entry.priceUsd.toFixed(2)} @ ${entry.price.publishTime}`);

  const signalId = keccak256(
    toUtf8Bytes(`${analystAa}:${direction}:${entry.price.publishTime}:${attestationNum}`)
  ) as `0x${string}`;

  console.log(`▸ Holding ${HOLD_SECONDS}s...`);
  await sleep(HOLD_SECONDS * 1000);

  console.log('▸ Outcome price...');
  const outcome = await fetchLatestPrice('BTC_USD');
  console.log(`  BTC: $${outcome.priceUsd.toFixed(2)} @ ${outcome.price.publishTime}`);

  const bps = realizedBps(entry.priceUsd, outcome.priceUsd, direction);
  const outcomeEnum = classifyOutcome(bps);
  const outcomeLabel = ['Pending', 'Win', 'Loss', 'Neutral'][outcomeEnum];
  console.log(`  ${bps > 0 ? '+' : ''}${bps} bps → ${outcomeLabel}`);

  const combinedHash = keccak256(
    toUtf8Bytes(`${entry.updateHash}|${outcome.updateHash}`)
  ) as `0x${string}`;

  console.log('▸ Posting on-chain...');
  const tx = await contract.postAttestation(
    signalId, analystAa, traderAa, bps, HOLD_SECONDS, outcomeEnum, combinedHash
  );
  await tx.wait(1);
  console.log(`  ✓ tx: ${tx.hash}`);

  return { bps, outcome: outcomeLabel, tx: tx.hash };
}

async function main() {
  const contracts = JSON.parse(readFileSync('.sibyl/contracts.json', 'utf-8'));
  const v2Addr = contracts.contracts.SibylAttestationsV2?.address;
  if (!v2Addr) throw new Error('V2 not deployed');

  const agentsFile = JSON.parse(readFileSync('.sibyl/agents.json', 'utf-8'));
  const agents = agentsFile.agents ?? agentsFile;
  const analystAa = agents.analyst.aaAddress;
  const traderAa = agents.trader.aaAddress;

  console.log(`▸ Seeding The Oracle (${analystAa}) with ${COUNT} V2 attestations`);
  console.log(`  contract: ${v2Addr}`);
  console.log(`  hold per signal: ${HOLD_SECONDS}s`);
  console.log(`  estimated wallclock: ~${(COUNT * (HOLD_SECONDS + 5)) / 60} min\n`);

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const contract = new Contract(v2Addr, ATTESTATIONS_V2_ABI, wallet);

  const results: Array<{ bps: number; outcome: string; tx: string }> = [];
  for (let i = 0; i < COUNT; i++) {
    const direction = DIRECTIONS[i % DIRECTIONS.length];
    try {
      const r = await postOne(contract, analystAa, traderAa, direction, i + 1);
      results.push(r);
    } catch (err: any) {
      console.error(`  ✗ Attestation ${i + 1} failed: ${err.shortMessage ?? err.message}`);
    }
  }

  const total = await contract.totalAttestations();
  console.log(`\n══════ Summary ══════`);
  console.log(`Total V2 attestations on-chain: ${total}`);
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.bps > 0 ? '+' : ''}${r.bps} bps · ${r.outcome}`);
  });
  const wins = results.filter(r => r.outcome === 'Win').length;
  const losses = results.filter(r => r.outcome === 'Loss').length;
  const neutrals = results.filter(r => r.outcome === 'Neutral').length;
  const cumBps = results.reduce((acc, r) => acc + r.bps, 0);
  console.log(`  ${wins}W · ${losses}L · ${neutrals}N · cumulative ${cumBps > 0 ? '+' : ''}${cumBps} bps`);
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(e => { console.error('FATAL:', e?.shortMessage ?? e?.message ?? e); process.exit(1); });
