/**
 * Post the first attestation backed by real Pyth/Hermes BTC prices.
 *
 * Demo flow (compressed for hackathon — production version uses 4h hold):
 *   1. Fetch BTC/USD now (entry price)
 *   2. Wait HOLD_SECONDS (default 60s — long enough for price to actually move)
 *   3. Fetch BTC/USD again (outcome price)
 *   4. Compute realized bps based on analyst's strategy direction
 *   5. Post attestation to SibylAttestationsV2 with priceUpdateHash
 *
 * Default analyst: The Oracle (0x55Db3fbe... salt 1001 Bear → short bias).
 * Override with --analyst=<aa> --direction=long|short.
 *
 * Usage:
 *   pnpm tsx scripts/08_first_pyth_attestation.ts
 *   pnpm tsx scripts/08_first_pyth_attestation.ts --hold=30
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { JsonRpcProvider, Wallet, Contract, keccak256, toUtf8Bytes } from 'ethers';
import { readFileSync } from 'fs';
import {
  fetchLatestPrice,
  realizedBps,
  classifyOutcome,
  pythPriceToUsd,
} from '../services/oracle/hermes';

const RPC_URL = process.env.KITE_RPC_URL ?? 'https://rpc-testnet.gokite.ai';
const PRIVATE_KEY = process.env.HACKATHON_PRIVATE_KEY!;
if (!PRIVATE_KEY) throw new Error('HACKATHON_PRIVATE_KEY missing');

// ─── Args ────────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const HOLD_SECONDS = Number(args.hold ?? 60);
const DIRECTION = (args.direction ?? 'short') as 'long' | 'short';

// ─── ABI ────────────────────────────────────────────────────────────────────

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
  // Resolve contract + agent addresses
  const contracts = JSON.parse(readFileSync('.sibyl/contracts.json', 'utf-8'));
  const v2Addr = contracts.contracts.SibylAttestationsV2?.address;
  if (!v2Addr) throw new Error('SibylAttestationsV2 not deployed yet — run 07_deploy_attestations_v2.ts first');

  const agentsFile = JSON.parse(readFileSync('.sibyl/agents.json', 'utf-8'));
  const agents = agentsFile.agents ?? agentsFile;
  const analystAa = (args.analyst as string) ?? agents.analyst?.aaAddress;
  const traderAa = agents.trader?.aaAddress;
  if (!analystAa) throw new Error('analyst aaAddress missing in .sibyl/agents.json');
  if (!traderAa) throw new Error('trader aaAddress missing in .sibyl/agents.json');

  console.log('▸ Sibyl Day 5 — first Pyth-backed attestation');
  console.log(`  contract:  ${v2Addr}`);
  console.log(`  analyst:   ${analystAa}`);
  console.log(`  trader:    ${traderAa}`);
  console.log(`  direction: ${DIRECTION}`);
  console.log(`  hold:      ${HOLD_SECONDS}s\n`);

  // ─── Step 1: Entry price ──
  console.log('▸ Fetching BTC/USD entry price from Hermes...');
  const entry = await fetchLatestPrice('BTC_USD');
  console.log(`  BTC: $${entry.priceUsd.toFixed(2)}`);
  console.log(`  publishTime: ${entry.price.publishTime} (${new Date(entry.price.publishTime * 1000).toISOString()})`);
  console.log(`  hash: ${entry.updateHash}\n`);

  // Signal ID: keccak256(analyst || direction || entryPublishTime)
  const signalId = keccak256(
    toUtf8Bytes(`${analystAa}:${DIRECTION}:${entry.price.publishTime}`)
  ) as `0x${string}`;
  console.log(`  signalId: ${signalId}\n`);

  // ─── Step 2: Wait for hold window ──
  console.log(`▸ Holding for ${HOLD_SECONDS}s...`);
  for (let i = HOLD_SECONDS; i > 0; i -= 10) {
    await sleep(Math.min(10, i) * 1000);
    process.stdout.write(`  ${i - 10 < 0 ? 0 : i - 10}s...  `);
  }
  console.log('\n');

  // ─── Step 3: Outcome price ──
  console.log('▸ Fetching BTC/USD outcome price from Hermes...');
  const outcome = await fetchLatestPrice('BTC_USD');
  console.log(`  BTC: $${outcome.priceUsd.toFixed(2)}`);
  console.log(`  publishTime: ${outcome.price.publishTime} (${new Date(outcome.price.publishTime * 1000).toISOString()})`);
  console.log(`  hash: ${outcome.updateHash}\n`);

  // ─── Step 4: Compute realized bps ──
  const bps = realizedBps(entry.priceUsd, outcome.priceUsd, DIRECTION);
  const outcomeEnum = classifyOutcome(bps);
  const outcomeLabel = ['Pending', 'Win', 'Loss', 'Neutral'][outcomeEnum];
  console.log(`▸ Result:`);
  console.log(`  price moved: $${(outcome.priceUsd - entry.priceUsd).toFixed(2)} (${(((outcome.priceUsd - entry.priceUsd) / entry.priceUsd) * 100).toFixed(3)}%)`);
  console.log(`  realized bps: ${bps > 0 ? '+' : ''}${bps}`);
  console.log(`  outcome: ${outcomeLabel}\n`);

  // ─── Step 5: Combined hash for on-chain commitment ──
  // We commit a hash that covers BOTH entry and outcome — anyone can re-fetch
  // both publishTimes from Hermes and re-derive this hash.
  const combinedHash = keccak256(
    toUtf8Bytes(`${entry.updateHash}|${outcome.updateHash}`)
  ) as `0x${string}`;
  console.log(`▸ Combined priceUpdateHash: ${combinedHash}\n`);

  // ─── Step 6: Post attestation ──
  console.log('▸ Posting attestation on Kite L1...');
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
  console.log(`✓ Attestation #${total} live.\n`);

  console.log('Verify by re-fetching Hermes:');
  console.log(`  curl 'https://hermes.pyth.network/v2/updates/price/${entry.price.publishTime}?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43&parsed=true'`);
  console.log(`  curl 'https://hermes.pyth.network/v2/updates/price/${outcome.price.publishTime}?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43&parsed=true'`);
  console.log(`  → re-derive hashes → keccak256(entry|outcome) → matches ${combinedHash}`);
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(e => { console.error('FATAL:', e?.shortMessage ?? e?.message ?? e); process.exit(1); });
