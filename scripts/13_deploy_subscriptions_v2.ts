/**
 * Deploy SibylSubscriptionsV2 to Kite testnet.
 *
 * Usage: pnpm tsx scripts/13_deploy_subscriptions_v2.ts
 *
 * Note: this REPLACES SibylSubscriptions in .sibyl/contracts.json. The V1
 * contract at 0xb1e3d3f6... stays on-chain (immutable) but the frontend
 * stops pointing to it. The 1 USDT in V1's treasury stays there; we don't
 * need to migrate testnet money.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import solc from 'solc';

const RPC_URL = process.env.KITE_RPC_URL ?? 'https://rpc-testnet.gokite.ai';
const USDT = process.env.KITE_USDT_ADDRESS ?? '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63';
const PRIVATE_KEY = process.env.HACKATHON_PRIVATE_KEY!;
if (!PRIVATE_KEY) throw new Error('HACKATHON_PRIVATE_KEY missing in .env.local');

const SOURCE = 'contracts/SibylSubscriptionsV2.sol';

async function compile() {
  const source = readFileSync(SOURCE, 'utf-8');
  const input = {
    language: 'Solidity',
    sources: { 'SibylSubscriptionsV2.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const fatal = output.errors.filter((e: any) => e.severity === 'error');
    if (fatal.length) {
      console.error(fatal.map((e: any) => e.formattedMessage).join('\n'));
      throw new Error('Compilation failed');
    }
  }
  const c = output.contracts['SibylSubscriptionsV2.sol']['SibylSubscriptionsV2'];
  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}

async function main() {
  console.log('▸ Compiling SibylSubscriptionsV2...');
  const { abi, bytecode } = await compile();
  console.log(`  bytecode: ${(bytecode.length / 2 - 1)} bytes`);

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const balance = await provider.getBalance(wallet.address);
  console.log(`  deployer: ${wallet.address}`);
  console.log(`  balance:  ${(Number(balance) / 1e18).toFixed(6)} KITE`);
  console.log(`  USDT:     ${USDT}`);

  console.log('\n▸ Deploying...');
  const factory = new ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(USDT);
  const tx = contract.deploymentTransaction();
  console.log(`  tx: ${tx?.hash}`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  address: ${address}`);

  // Persist — replace SibylSubscriptions entry, keep old as historical
  const path = '.sibyl/contracts.json';
  let registry: any = { contracts: {} };
  if (existsSync(path)) registry = JSON.parse(readFileSync(path, 'utf-8'));
  if (!registry.contracts) registry.contracts = {};

  // Archive V1 reference if present
  if (registry.contracts.SibylSubscriptions && !registry.contracts.SibylSubscriptions_v1_archived) {
    registry.contracts.SibylSubscriptions_v1_archived = registry.contracts.SibylSubscriptions;
    registry.contracts.SibylSubscriptions_v1_archived.note =
      '[ARCHIVED] V1 with fixed 30-day periods. Replaced by SibylSubscriptionsV2 with daily granularity.';
  }

  registry.contracts.SibylSubscriptions = {
    address,
    deployTxHash: tx?.hash,
    deployedAt: new Date().toISOString(),
    version: 'V2',
    note: 'Day 13: real duration support. subscribe(analyst, daysCount). 7d/14d/30d/60d UI options.',
    pricePerDayWei: '16666666666666667', // 0.5 USDT / 30
    minDays: 1,
    maxDays: 365,
    examples: {
      '7d': { wei: '116666666666666669', human: '~0.1167 USDT' },
      '14d': { wei: '233333333333333338', human: '~0.2333 USDT' },
      '30d': { wei: '500000000000000010', human: '~0.5000 USDT' },
      '60d': { wei: '1000000000000000020', human: '~1.0000 USDT' },
    },
  };
  writeFileSync(path, JSON.stringify(registry, null, 2));
  console.log(`\n▸ Saved to ${path}`);

  const newBalance = await provider.getBalance(wallet.address);
  const spent = (Number(balance) - Number(newBalance)) / 1e18;
  console.log(`✓ Deploy complete. Spent ${spent.toFixed(6)} KITE.`);
  console.log(`\nNext: pnpm tsx scripts/14_smoke_test_subs_v2.ts`);
}

main().catch(e => { console.error('FATAL:', e?.shortMessage ?? e?.message ?? e); process.exit(1); });
