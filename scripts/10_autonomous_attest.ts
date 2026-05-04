/**
 * Autonomous attestation generator — runs every 4h via GitHub Actions cron.
 *
 * Closed-window pattern:
 *   At time T, attest the (T-4h → T) window.
 *   Entry price: Hermes price at T-4h (via publishTime lookup)
 *   Outcome price: Hermes price now
 *   Realized bps: computed from those two prices using Oracle's strategy direction
 *
 * The Oracle is a Bear strategy → always short. Profits when BTC drops.
 *
 * Usage (manual): pnpm tsx scripts/10_autonomous_attest.ts
 * Usage (cron):   triggered by .github/workflows/autonomous-attest.yml every 4h
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { JsonRpcProvider, Wallet, Contract, keccak256, toUtf8Bytes } from 'ethers';
import { readFileSync } from 'fs';
import {
  fetchLatestPrice,
  fetchPriceAt,
  realizedBps,
  classifyOutcome,
} from '../services/oracle/hermes';

const RPC_URL = process.env.KITE_RPC_URL ?? 'https://rpc-testnet.gokite.ai';
const PRIVATE_KEY = process.env.HACKATHON_PRIVATE_KEY!;
if (!PRIVATE_KEY) {
  console.error('FATAL: HACKATHON_PRIVATE_KEY missing');
  process.exit(1);
}

const HOLD_SECONDS = 4 * 60 * 60; // 4 hours — the autonomous economy heartbeat

// ─── Strategy → direction (Day 6: Oracle only, Bear → short) ────────────────

type Strategy = 'Bear' | 'Chaser' | 'Reverter' | 'Custom';

function strategyDirection(strategy: Strategy): 'long' | 'short' {
  // For Day 6 we only run The Oracle (Bear). Mapping kept generic for Day 7
  // when we expand to all analysts.
  switch (strategy) {
    case 'Bear':     return 'short';
    case 'Chaser':   return 'long';
    case 'Reverter': return 'short'; // Day 7: replace with last-24h trend lookup
    default:         return 'short';
  }
}

// ─── ABI ─────────────────────────────────────────────────────────────────────

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

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = Date.now();
  console.log(`▸ Sibyl autonomous attestation — ${new Date().toISOString()}`);

  const contracts = JSON.parse(readFileSync('.sibyl/contracts.json', 'utf-8'));
  const v2Addr = contracts.contracts.SibylAttestationsV2?.address;
  if (!v2Addr) throw new Error('SibylAttestationsV2 not deployed');

  const agentsFile = JSON.parse(readFileSync('.sibyl/agents.json', 'utf-8'));
  const agents = agentsFile.agents ?? agentsFile;
  const analystAa = agents.analyst.aaAddress;
  const traderAa = agents.trader.aaAddress;
  const strategy: Strategy = 'Bear'; // The Oracle
  const direction = strategyDirection(strategy);

  console.log(`  contract: ${v2Addr}`);
  console.log(`  analyst:  ${analystAa} (Oracle, ${strategy})`);
  console.log(`  direction: ${direction}\n`);

  // ─── Step 1: Outcome price = now ──
  console.log('▸ Fetching outcome price (now)...');
  const outcome = await fetchLatestPrice('BTC_USD');
  const outcomeT = outcome.price.publishTime;
  console.log(`  BTC: $${outcome.priceUsd.toFixed(2)} @ ${outcomeT} (${new Date(outcomeT * 1000).toISOString()})`);

  // ─── Step 2: Entry price = 4h before outcome publishTime ──
  const entryT = outcomeT - HOLD_SECONDS;
  console.log(`\n▸ Fetching entry price at t=${entryT} (${new Date(entryT * 1000).toISOString()})...`);
  const entry = await fetchPriceAt(entryT, 'BTC_USD');
  console.log(`  BTC: $${entry.priceUsd.toFixed(2)} @ ${entry.price.publishTime}`);

  // Hermes returns the *closest* published price; verify it's within tolerance
  const entryDrift = Math.abs(entry.price.publishTime - entryT);
  if (entryDrift > 60) {
    console.warn(`  ⚠ Entry price drift: ${entryDrift}s from requested timestamp`);
  }

  // ─── Step 3: Compute bps ──
  const bps = realizedBps(entry.priceUsd, outcome.priceUsd, direction);
  const outcomeEnum = classifyOutcome(bps);
  const outcomeLabel = ['Pending', 'Win', 'Loss', 'Neutral'][outcomeEnum];

  console.log(`\n▸ Result:`);
  console.log(`  4h move: $${(outcome.priceUsd - entry.priceUsd).toFixed(2)} (${(((outcome.priceUsd - entry.priceUsd) / entry.priceUsd) * 100).toFixed(3)}%)`);
  console.log(`  realized bps: ${bps > 0 ? '+' : ''}${bps}`);
  console.log(`  outcome: ${outcomeLabel}`);

  // ─── Step 4: Hashes ──
  const signalId = keccak256(
    toUtf8Bytes(`${analystAa}:${direction}:${entryT}:cron`)
  ) as `0x${string}`;
  const combinedHash = keccak256(
    toUtf8Bytes(`${entry.updateHash}|${outcome.updateHash}`)
  ) as `0x${string}`;

  console.log(`\n  signalId: ${signalId}`);
  console.log(`  priceUpdateHash: ${combinedHash}`);

  // ─── Step 5: Post on-chain ──
  console.log('\n▸ Posting attestation on Kite L1...');
  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const contract = new Contract(v2Addr, ATTESTATIONS_V2_ABI, wallet);

  const tx = await contract.postAttestation(
    signalId,
    analystAa,
    traderAa,
    bps,
    HOLD_SECONDS,
    outcomeEnum,
    combinedHash
  );
  console.log(`  tx: ${tx.hash}`);
  await tx.wait(1);
  const total = await contract.totalAttestations();
  console.log(`✓ Attestation #${total} live.`);

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n[done in ${elapsedSec}s]`);
}

main().catch(e => {
  console.error('FATAL:', e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
