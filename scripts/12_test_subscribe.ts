/**
 * Smoke test the subscription flow end-to-end.
 *
 * Steps:
 *   1. Read deployed SibylSubscriptions address from .sibyl/contracts.json
 *   2. Check EOA's USDT balance — abort if insufficient
 *   3. Approve SibylSubscriptions to spend 0.5 USDT
 *   4. Call subscribe(theOracle)
 *   5. Verify isSubscribed() returns true and expiresAt is ~30 days out
 *
 * Usage: pnpm tsx scripts/12_test_subscribe.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { JsonRpcProvider, Wallet, Contract, parseEther, formatEther } from 'ethers';
import { readFileSync } from 'fs';

const RPC_URL = process.env.KITE_RPC_URL ?? 'https://rpc-testnet.gokite.ai';
const USDT = process.env.KITE_USDT_ADDRESS ?? '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63';
const PRIVATE_KEY = process.env.HACKATHON_PRIVATE_KEY!;
if (!PRIVATE_KEY) throw new Error('HACKATHON_PRIVATE_KEY missing');

const PRICE = parseEther('0.5'); // 0.5 USDT (18 decimals on Kite testnet)

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const SUBS_ABI = [
  { type: 'function', name: 'subscribe', stateMutability: 'nonpayable',
    inputs: [{ name: 'analyst', type: 'address' }], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'isSubscribed', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'expiresAt', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'timeRemaining', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'PRICE_PER_PERIOD', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
];

async function main() {
  const contracts = JSON.parse(readFileSync('.sibyl/contracts.json', 'utf-8'));
  const subsAddr = contracts.contracts.SibylSubscriptions?.address;
  if (!subsAddr) throw new Error('SibylSubscriptions not deployed — run 11_deploy_subscriptions.ts first');

  const agentsFile = JSON.parse(readFileSync('.sibyl/agents.json', 'utf-8'));
  const agents = agentsFile.agents ?? agentsFile;
  const oracleAa = agents.analyst.aaAddress; // The Oracle

  console.log('▸ Sibyl Day 10 — subscription smoke test');
  console.log(`  contract: ${subsAddr}`);
  console.log(`  USDT:     ${USDT}`);
  console.log(`  Oracle:   ${oracleAa}\n`);

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const usdt = new Contract(USDT, ERC20_ABI, wallet);
  const subs = new Contract(subsAddr, SUBS_ABI, wallet);

  // ─── Step 1: Check USDT balance ──
  console.log('▸ Reading USDT balance...');
  const balance = (await usdt.balanceOf(wallet.address)) as bigint;
  console.log(`  balance: ${formatEther(balance)} USDT`);

  if (balance < PRICE) {
    console.error(`✗ Insufficient USDT. Need ${formatEther(PRICE)}, have ${formatEther(balance)}.`);
    console.error('  Hit the Kite faucet at https://faucet.gokite.ai/ to get testnet USDT.');
    process.exit(1);
  }

  // ─── Step 2: Approve ──
  console.log(`\n▸ Approving SibylSubscriptions for ${formatEther(PRICE)} USDT...`);
  const allowance = (await usdt.allowance(wallet.address, subsAddr)) as bigint;
  console.log(`  current allowance: ${formatEther(allowance)} USDT`);
  if (allowance < PRICE) {
    const approveTx = await usdt.approve(subsAddr, PRICE);
    console.log(`  approve tx: ${approveTx.hash}`);
    await approveTx.wait(1);
    console.log(`  ✓ approved`);
  } else {
    console.log(`  ✓ already approved`);
  }

  // ─── Step 3: Was already subscribed? ──
  const wasSubscribed = (await subs.isSubscribed(wallet.address, oracleAa)) as boolean;
  if (wasSubscribed) {
    const remaining = (await subs.timeRemaining(wallet.address, oracleAa)) as bigint;
    console.log(`\n  ⚠ Already subscribed. ${(Number(remaining) / 86400).toFixed(2)} days remaining.`);
    console.log(`  Subscribing again will stack — extends from current expiry.`);
  }

  // ─── Step 4: Subscribe ──
  console.log(`\n▸ Subscribing to The Oracle...`);
  const subTx = await subs.subscribe(oracleAa);
  console.log(`  tx: ${subTx.hash}`);
  await subTx.wait(1);

  // ─── Step 5: Verify ──
  const isSubNow = (await subs.isSubscribed(wallet.address, oracleAa)) as boolean;
  const expires = (await subs.expiresAt(wallet.address, oracleAa)) as bigint;
  const remaining = (await subs.timeRemaining(wallet.address, oracleAa)) as bigint;
  const now = Math.floor(Date.now() / 1000);

  console.log(`\n▸ Verified on-chain:`);
  console.log(`  isSubscribed: ${isSubNow}`);
  console.log(`  expiresAt:    ${expires} (${new Date(Number(expires) * 1000).toISOString()})`);
  console.log(`  remaining:    ${(Number(remaining) / 86400).toFixed(2)} days`);

  if (!isSubNow) {
    console.error(`✗ Subscription tx succeeded but state shows not subscribed — investigate`);
    process.exit(1);
  }

  console.log(`\n✓ Day 10 smoke test passed. Subscription flow is real.`);
}

main().catch(e => { console.error('FATAL:', e?.shortMessage ?? e?.message ?? e); process.exit(1); });
