/**
 * Smoke test SibylSubscriptionsV2 — manual nonce.
 *
 * Day 13a v2: after approve confirms, ethers' nonce cache was stale → subscribe
 * call hit 'nonce has already been used'. Fetch nonce from pending each
 * write-step to avoid this.
 *
 * Usage: pnpm tsx scripts/14_smoke_test_subs_v2.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { JsonRpcProvider, Wallet, Contract, Interface, formatEther } from 'ethers';
import { readFileSync } from 'fs';

const RPC_URL = process.env.KITE_RPC_URL ?? 'https://rpc-testnet.gokite.ai';
const USDT = process.env.KITE_USDT_ADDRESS ?? '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63';
const PRIVATE_KEY = process.env.HACKATHON_PRIVATE_KEY!;
if (!PRIVATE_KEY) throw new Error('HACKATHON_PRIVATE_KEY missing');

const PRICE_PER_DAY = 16_666_666_666_666_667n;
const TEST_DAYS = 7n;
const TEST_COST = PRICE_PER_DAY * TEST_DAYS;

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const SUBS_V2_ABI = [
  { type: 'function', name: 'subscribe', stateMutability: 'nonpayable',
    inputs: [{ name: 'analyst', type: 'address' }, { name: 'daysCount', type: 'uint64' }],
    outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'isSubscribed', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'expiresAt', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'timeRemaining', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'quoteCost', stateMutability: 'pure',
    inputs: [{ type: 'uint64' }], outputs: [{ type: 'uint256' }] },
];

async function sendWithFreshNonce(
  wallet: Wallet,
  provider: JsonRpcProvider,
  to: string,
  data: string,
): Promise<{ hash: string }> {
  // Fetch fresh nonce right before each send
  const nonce = await provider.getTransactionCount(wallet.address, 'pending');
  const tx = await wallet.sendTransaction({ to, data, nonce });
  await tx.wait(1);
  return { hash: tx.hash };
}

async function main() {
  const contracts = JSON.parse(readFileSync('.sibyl/contracts.json', 'utf-8'));
  const subsAddr = contracts.contracts.SibylSubscriptions?.address;
  const subsVersion = contracts.contracts.SibylSubscriptions?.version;
  if (!subsAddr) throw new Error('SibylSubscriptions not deployed');
  if (subsVersion !== 'V2') console.warn(`⚠ version=${subsVersion}, expected V2`);

  const agentsFile = JSON.parse(readFileSync('.sibyl/agents.json', 'utf-8'));
  const agents = agentsFile.agents ?? agentsFile;
  const oracleAa = agents.analyst.aaAddress;

  console.log('▸ Sibyl Day 13a v2 — smoke test (manual nonce)');
  console.log(`  contract: ${subsAddr} (${subsVersion ?? 'unknown'})`);
  console.log(`  USDT:     ${USDT}`);
  console.log(`  Oracle:   ${oracleAa}`);
  console.log(`  test:     subscribe for ${TEST_DAYS} days`);
  console.log(`  cost:     ${formatEther(TEST_COST)} USDT\n`);

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const usdt = new Contract(USDT, ERC20_ABI, wallet);
  const subs = new Contract(subsAddr, SUBS_V2_ABI, wallet);
  const usdtIface = new Interface(ERC20_ABI);
  const subsIface = new Interface(SUBS_V2_ABI);

  // Quote sanity check
  const quoted = (await subs.quoteCost(TEST_DAYS)) as bigint;
  console.log(`▸ on-chain quote for ${TEST_DAYS}d: ${formatEther(quoted)} USDT`);
  if (quoted !== TEST_COST) {
    console.error(`✗ quote mismatch`);
    process.exit(1);
  }
  console.log(`  ✓ matches local math\n`);

  // Balance check
  console.log('▸ Reading USDT balance...');
  const balance = (await usdt.balanceOf(wallet.address)) as bigint;
  console.log(`  balance: ${formatEther(balance)} USDT`);
  if (balance < TEST_COST) {
    console.error(`✗ Insufficient. Need ${formatEther(TEST_COST)}, have ${formatEther(balance)}.`);
    console.error('  Faucet: https://faucet.gokite.ai/');
    process.exit(1);
  }

  // Approve (manual nonce)
  console.log(`\n▸ Approving for ${formatEther(TEST_COST)} USDT...`);
  const allowance = (await usdt.allowance(wallet.address, subsAddr)) as bigint;
  console.log(`  current allowance: ${formatEther(allowance)} USDT`);
  if (allowance < TEST_COST) {
    const approveData = usdtIface.encodeFunctionData('approve', [subsAddr, TEST_COST]);
    const approveRes = await sendWithFreshNonce(wallet, provider, USDT, approveData);
    console.log(`  approve tx: ${approveRes.hash}`);
    console.log(`  ✓ approved`);
  } else {
    console.log(`  ✓ already approved`);
  }

  // Wait briefly for RPC to propagate the approve receipt
  await sleep(1500);

  // Subscribe (FRESH nonce — this was failing before)
  const wasSubscribed = (await subs.isSubscribed(wallet.address, oracleAa)) as boolean;
  if (wasSubscribed) {
    const remaining = (await subs.timeRemaining(wallet.address, oracleAa)) as bigint;
    console.log(`\n  ⚠ Already subscribed. ${(Number(remaining) / 86400).toFixed(2)}d remaining (will stack).`);
  }

  console.log(`\n▸ Subscribing to The Oracle for ${TEST_DAYS} days (fresh nonce)...`);
  const subscribeData = subsIface.encodeFunctionData('subscribe', [oracleAa, TEST_DAYS]);
  const subRes = await sendWithFreshNonce(wallet, provider, subsAddr, subscribeData);
  console.log(`  tx: ${subRes.hash}`);

  // Verify
  const isSubNow = (await subs.isSubscribed(wallet.address, oracleAa)) as boolean;
  const expires = (await subs.expiresAt(wallet.address, oracleAa)) as bigint;
  const remaining = (await subs.timeRemaining(wallet.address, oracleAa)) as bigint;
  const days = Number(remaining) / 86400;

  console.log(`\n▸ Verified on-chain:`);
  console.log(`  isSubscribed: ${isSubNow}`);
  console.log(`  expiresAt:    ${expires} (${new Date(Number(expires) * 1000).toISOString()})`);
  console.log(`  remaining:    ${days.toFixed(3)} days`);

  if (!isSubNow) {
    console.error(`✗ Subscription tx succeeded but state shows not subscribed`);
    process.exit(1);
  }
  if (days < Number(TEST_DAYS) - 0.1) {
    console.error(`✗ Expected at least ${TEST_DAYS}d remaining, got ${days.toFixed(3)}d`);
    process.exit(1);
  }

  console.log(`\n✓ Day 13a v2 chain layer locked. V2 subscriptions support real durations.`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => { console.error('FATAL:', e?.shortMessage ?? e?.message ?? e); process.exit(1); });
